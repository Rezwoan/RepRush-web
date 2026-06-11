import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { CreatineLog } from './creatine-log.entity';

@Injectable()
export class CreatineService {
  constructor(@InjectRepository(CreatineLog) private logRepo: Repository<CreatineLog>) {}

  async logDose(userId: number, amountGrams: number, note?: string, date?: string) {
    const entry = await this.logRepo.save(this.logRepo.create({ userId, amountGrams, note }));
    // Backdate to a chosen day (loggedAt is a CreateDateColumn → override via update).
    if (date) {
      const when = new Date(`${date}T12:00:00`);
      if (!isNaN(when.getTime())) await this.logRepo.update(entry.id, { loggedAt: when });
    }
    return entry;
  }

  private dayLogs(userId: number, ref: Date) {
    const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1);
    return this.logRepo.find({ where: { userId, loggedAt: Between(start, end) }, order: { loggedAt: 'ASC' } });
  }

  async getTodayLogs(userId: number) {
    const logs = await this.dayLogs(userId, new Date());
    return { logs, totalGrams: logs.reduce((sum, l) => sum + l.amountGrams, 0) };
  }

  async getForDate(userId: number, date: string) {
    const ref = new Date(`${date}T12:00:00`);
    const logs = await this.dayLogs(userId, isNaN(ref.getTime()) ? new Date() : ref);
    return { logs, totalGrams: logs.reduce((sum, l) => sum + l.amountGrams, 0) };
  }

  async getHistory(userId: number, days = 30) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const logs = await this.logRepo.find({
      where: { userId, loggedAt: Between(start, end) },
      order: { loggedAt: 'DESC' },
    });

    // Group by date
    const byDate: Record<string, number> = {};
    logs.forEach((l) => {
      const d = l.loggedAt.toISOString().split('T')[0];
      byDate[d] = (byDate[d] || 0) + l.amountGrams;
    });
    return { logs, byDate };
  }

  async deleteLog(id: number, userId: number) {
    await this.logRepo.delete({ id, userId });
    return { message: 'Log deleted' };
  }
}
