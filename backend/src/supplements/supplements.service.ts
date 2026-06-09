import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Supplement } from './supplement.entity';
import { SupplementLog } from './supplement-log.entity';

const DEFAULTS = [
  { name: 'Magnesium', unit: 'mg', defaultDose: 400, dailyTarget: 400, sortOrder: 1 },
  { name: 'Omega-3 Fish Oil', unit: 'mg', defaultDose: 1000, dailyTarget: 1000, sortOrder: 2 },
  { name: 'Vitamin D3', unit: 'IU', defaultDose: 2000, dailyTarget: 2000, sortOrder: 3 },
];

@Injectable()
export class SupplementsService {
  constructor(
    @InjectRepository(Supplement) private suppRepo: Repository<Supplement>,
    @InjectRepository(SupplementLog) private logRepo: Repository<SupplementLog>,
  ) {}

  private dayBounds(d = new Date()) {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return { start, end };
  }

  async ensureDefaults(userId: number) {
    const count = await this.suppRepo.count({ where: { userId } });
    if (count === 0) {
      await this.suppRepo.save(DEFAULTS.map((d) => this.suppRepo.create({ ...d, userId })));
    }
  }

  async list(userId: number) {
    await this.ensureDefaults(userId);
    return this.suppRepo.find({ where: { userId }, order: { sortOrder: 'ASC', createdAt: 'ASC' } });
  }

  async add(userId: number, data: { name: string; unit?: string; defaultDose?: number; dailyTarget?: number }) {
    const max = await this.suppRepo.find({ where: { userId }, order: { sortOrder: 'DESC' }, take: 1 });
    const sortOrder = (max[0]?.sortOrder || 0) + 1;
    const entry = this.suppRepo.create({
      userId,
      name: data.name,
      unit: data.unit || 'mg',
      defaultDose: data.defaultDose ?? null,
      dailyTarget: data.dailyTarget ?? null,
      sortOrder,
    });
    return this.suppRepo.save(entry);
  }

  async remove(userId: number, id: number) {
    const supp = await this.suppRepo.findOne({ where: { id, userId } });
    if (!supp) throw new ForbiddenException('Supplement not found');
    await this.logRepo.delete({ supplementId: id, userId });
    await this.suppRepo.delete({ id, userId });
    return { message: 'Supplement removed' };
  }

  async logDose(userId: number, supplementId: number, amount: number) {
    const supp = await this.suppRepo.findOne({ where: { id: supplementId, userId } });
    if (!supp) throw new ForbiddenException('Supplement not found');
    const entry = this.logRepo.create({ userId, supplementId, amount });
    return this.logRepo.save(entry);
  }

  async deleteLog(userId: number, logId: number) {
    await this.logRepo.delete({ id: logId, userId });
    return { message: 'Log deleted' };
  }

  /** Today's supplements with their definition, total and individual logs. */
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

  /** Per-day supplement totals for the heatmap / day details. */
  async getHeatmap(userId: number, year?: number) {
    const y = year || new Date().getFullYear();
    const start = new Date(`${y}-01-01`);
    const end = new Date(`${y}-12-31T23:59:59`);
    const supps = await this.suppRepo.find({ where: { userId } });
    const nameById = new Map(supps.map((s) => [s.id, s]));
    const logs = await this.logRepo.find({
      where: { userId, loggedAt: Between(start, end) },
      order: { loggedAt: 'ASC' },
    });
    const map: Record<string, { name: string; total: number; unit: string }[]> = {};
    logs.forEach((l) => {
      const d = l.loggedAt.toISOString().split('T')[0];
      const supp = nameById.get(l.supplementId);
      if (!supp) return;
      if (!map[d]) map[d] = [];
      const existing = map[d].find((x) => x.name === supp.name);
      if (existing) existing.total += l.amount;
      else map[d].push({ name: supp.name, total: l.amount, unit: supp.unit });
    });
    return map;
  }
}
