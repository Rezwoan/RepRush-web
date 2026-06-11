import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Supplement } from './supplement.entity';
import { SupplementLog } from './supplement-log.entity';
import { CreatineLog } from '../creatine/creatine-log.entity';
import { UsersService } from '../users/users.service';
import { ymd } from '../common/date.util';

// Creatine lives in its own table but shares the heatmap rings. Default is a
// distinct emerald not used by supplement DEFAULTS/PALETTE; user-overridable.
const CREATINE_COLOR = '#10b981';

const DEFAULTS = [
  { name: 'Magnesium', unit: 'mg', defaultDose: 400, dailyTarget: 400, color: '#a78bfa', sortOrder: 1 },
  { name: 'Omega-3 Fish Oil', unit: 'mg', defaultDose: 1000, dailyTarget: 1000, color: '#22d3ee', sortOrder: 2 },
  { name: 'Vitamin D3', unit: 'IU', defaultDose: 2000, dailyTarget: 2000, color: '#faba0c', sortOrder: 3 },
];

// Distinct, dark-friendly palette for auto-assigning colors to custom supplements
const PALETTE = ['#34d399', '#f472b6', '#60a5fa', '#fb923c', '#f87171', '#a3e635', '#e879f9', '#2dd4bf', '#fbbf24', '#c084fc'];

@Injectable()
export class SupplementsService {
  constructor(
    @InjectRepository(Supplement) private suppRepo: Repository<Supplement>,
    @InjectRepository(SupplementLog) private logRepo: Repository<SupplementLog>,
    @InjectRepository(CreatineLog) private creatineRepo: Repository<CreatineLog>,
    private usersService: UsersService,
  ) {}

  private dayBounds(d = new Date()) {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return { start, end };
  }

  private async pickColor(userId: number): Promise<string> {
    const existing = await this.suppRepo.find({ where: { userId } });
    const used = new Set(existing.map((s) => s.color));
    return PALETTE.find((c) => !used.has(c)) || PALETTE[existing.length % PALETTE.length];
  }

  async ensureDefaults(userId: number) {
    const count = await this.suppRepo.count({ where: { userId } });
    if (count === 0) {
      await this.suppRepo.save(DEFAULTS.map((d) => this.suppRepo.create({ ...d, userId })));
      return;
    }
    // Backfill colors for supplements created before colors existed.
    const supps = await this.suppRepo.find({ where: { userId } });
    if (supps.some((s) => !s.color)) {
      const used = new Set(supps.filter((s) => s.color).map((s) => s.color));
      const changed: Supplement[] = [];
      for (const s of supps) {
        if (s.color) continue;
        const preset = DEFAULTS.find((d) => d.name.toLowerCase() === s.name.toLowerCase());
        let c = preset && !used.has(preset.color) ? preset.color : PALETTE.find((p) => !used.has(p)) || PALETTE[0];
        s.color = c; used.add(c); changed.push(s);
      }
      if (changed.length) await this.suppRepo.save(changed);
    }
  }

  async list(userId: number) {
    await this.ensureDefaults(userId);
    return this.suppRepo.find({ where: { userId }, order: { sortOrder: 'ASC', createdAt: 'ASC' } });
  }

  async add(userId: number, data: { name: string; unit?: string; defaultDose?: number; dailyTarget?: number; color?: string }) {
    const max = await this.suppRepo.find({ where: { userId }, order: { sortOrder: 'DESC' }, take: 1 });
    const sortOrder = (max[0]?.sortOrder || 0) + 1;
    const entry = this.suppRepo.create({
      userId,
      name: data.name,
      unit: data.unit || 'mg',
      defaultDose: data.defaultDose ?? null,
      dailyTarget: data.dailyTarget ?? null,
      color: data.color || (await this.pickColor(userId)),
      sortOrder,
    });
    return this.suppRepo.save(entry);
  }

  async update(userId: number, id: number, data: Partial<Pick<Supplement, 'name' | 'unit' | 'defaultDose' | 'dailyTarget' | 'color'>>) {
    const supp = await this.suppRepo.findOne({ where: { id, userId } });
    if (!supp) throw new ForbiddenException('Supplement not found');
    Object.assign(supp, data);
    return this.suppRepo.save(supp);
  }

  async remove(userId: number, id: number) {
    const supp = await this.suppRepo.findOne({ where: { id, userId } });
    if (!supp) throw new ForbiddenException('Supplement not found');
    await this.logRepo.delete({ supplementId: id, userId });
    await this.suppRepo.delete({ id, userId });
    return { message: 'Supplement removed' };
  }

  async logDose(userId: number, supplementId: number, amount: number, date?: string) {
    const supp = await this.suppRepo.findOne({ where: { id: supplementId, userId } });
    if (!supp) throw new ForbiddenException('Supplement not found');
    const entry = await this.logRepo.save(this.logRepo.create({ userId, supplementId, amount }));
    // Backdate to a chosen day (e.g. logging last night's dose after midnight).
    // loggedAt is a CreateDateColumn, so override it with a follow-up update.
    if (date) {
      const when = new Date(`${date}T12:00:00`);
      if (!isNaN(when.getTime())) await this.logRepo.update(entry.id, { loggedAt: when });
    }
    return entry;
  }

  async updateLog(userId: number, logId: number, amount: number) {
    const log = await this.logRepo.findOne({ where: { id: logId, userId } });
    if (!log) throw new ForbiddenException('Log not found');
    log.amount = amount;
    return this.logRepo.save(log);
  }

  async deleteLog(userId: number, logId: number) {
    await this.logRepo.delete({ id: logId, userId });
    return { message: 'Log deleted' };
  }

  async getToday(userId: number) {
    await this.ensureDefaults(userId);
    const supps = await this.suppRepo.find({ where: { userId }, order: { sortOrder: 'ASC', createdAt: 'ASC' } });
    const { start, end } = this.dayBounds();
    const logs = await this.logRepo.find({
      where: { userId, loggedAt: Between(start, end) },
      order: { loggedAt: 'ASC' },
    });
    return supps.map((s) => {
      const sLogs = logs.filter((l) => l.supplementId === s.id);
      return {
        ...s,
        totalToday: sLogs.reduce((sum, l) => sum + l.amount, 0),
        logs: sLogs.map((l) => ({ id: l.id, amount: l.amount, loggedAt: l.loggedAt })),
      };
    });
  }

  /** Same shape as getToday but for any chosen day (heatmap date editing). */
  async getForDate(userId: number, date: string) {
    await this.ensureDefaults(userId);
    const supps = await this.suppRepo.find({ where: { userId }, order: { sortOrder: 'ASC', createdAt: 'ASC' } });
    const ref = new Date(`${date}T12:00:00`);
    const { start, end } = this.dayBounds(isNaN(ref.getTime()) ? new Date() : ref);
    const logs = await this.logRepo.find({
      where: { userId, loggedAt: Between(start, end) },
      order: { loggedAt: 'ASC' },
    });
    return supps.map((s) => {
      const sLogs = logs.filter((l) => l.supplementId === s.id);
      return {
        ...s,
        totalToday: sLogs.reduce((sum, l) => sum + l.amount, 0),
        logs: sLogs.map((l) => ({ id: l.id, amount: l.amount, loggedAt: l.loggedAt })),
      };
    });
  }

  async getHeatmap(userId: number, year?: number) {
    const y = year || new Date().getFullYear();
    const start = new Date(`${y}-01-01`);
    const end = new Date(`${y}-12-31T23:59:59`);
    const supps = await this.suppRepo.find({ where: { userId } });
    const byId = new Map(supps.map((s) => [s.id, s]));
    const logs = await this.logRepo.find({
      where: { userId, loggedAt: Between(start, end) },
      order: { loggedAt: 'ASC' },
    });
    const map: Record<string, { name: string; total: number; unit: string; color: string }[]> = {};
    logs.forEach((l) => {
      const d = ymd(l.loggedAt);
      const supp = byId.get(l.supplementId);
      if (!supp) return;
      if (!map[d]) map[d] = [];
      const existing = map[d].find((x) => x.name === supp.name);
      if (existing) existing.total += l.amount;
      else map[d].push({ name: supp.name, total: l.amount, unit: supp.unit, color: supp.color || '#34d399' });
    });

    // Fold in creatine (separate table) so it also draws a ring on the heatmap,
    // in the user's chosen creatine colour (defaults to emerald).
    const user = await this.usersService.findById(userId);
    const creatineColor = user?.creatineColor || CREATINE_COLOR;
    const creatineLogs = await this.creatineRepo.find({
      where: { userId, loggedAt: Between(start, end) },
      order: { loggedAt: 'ASC' },
    });
    creatineLogs.forEach((l) => {
      const d = ymd(l.loggedAt);
      if (!map[d]) map[d] = [];
      const existing = map[d].find((x) => x.name === 'Creatine');
      if (existing) existing.total += l.amountGrams;
      else map[d].unshift({ name: 'Creatine', total: l.amountGrams, unit: 'g', color: creatineColor });
    });
    return map;
  }
}
