import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BodyWeightLog } from './body-weight-log.entity';

@Injectable()
export class BodyWeightService {
  constructor(
    @InjectRepository(BodyWeightLog) private repo: Repository<BodyWeightLog>,
  ) {}

  async log(userId: number, weightKg: number, note?: string) {
    const date = new Date().toISOString().split('T')[0];
    const existing = await this.repo.findOne({ where: { userId, date } });
    if (existing) {
      existing.weightKg = weightKg;
      if (note !== undefined) existing.note = note;
      return this.repo.save(existing);
    }
    const entry = this.repo.create({ userId, weightKg, note: note || null, date });
    return this.repo.save(entry);
  }

  async getHistory(userId: number, days = 90) {
    const all = await this.repo.find({
      where: { userId },
      order: { date: 'ASC' },
    });
    return all.slice(-days);
  }

  async getLatest(userId: number) {
    return this.repo.findOne({
      where: { userId },
      order: { date: 'DESC' },
    });
  }

  async getForAdmin(userId: number, days = 30) {
    const all = await this.repo.find({ where: { userId }, order: { date: 'ASC' } });
    return all.slice(-days);
  }
}
