import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { CreatineLog } from './creatine-log.entity';

@Injectable()
export class CreatineService {
  constructor(@InjectRepository(CreatineLog) private logRepo: Repository<CreatineLog>) {}

  async logDose(userId: number, amountGrams: number, note?: string) {
    const entry = this.logRepo.create({ userId, amountGrams, note });
    return this.logRepo.save(entry);
  }

  async getTodayLogs(userId: number) {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const logs = await this.logRepo.find({
      where: { userId, loggedAt: Between(start, end) },
      order: { loggedAt: 'ASC' },
    });
    const totalGrams = logs.reduce((sum, l) => sum + l.amountGrams, 0);
    return { logs, totalGrams };
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
