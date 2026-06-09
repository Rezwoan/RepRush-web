import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExercisePlan } from './exercise-plan.entity';
import { UserPlan } from './user-plan.entity';
import { User, UserRole } from '../users/user.entity';

@Injectable()
export class ExercisesService {
  constructor(
    @InjectRepository(ExercisePlan) private planRepo: Repository<ExercisePlan>,
    @InjectRepository(UserPlan) private userPlanRepo: Repository<UserPlan>,
  ) {}

  // ─── Plans (admin) ────────────────────────────────────────────────────────────

  async createPlan(adminId: number, name: string, exercisesJson: any) {
    const plan = this.planRepo.create({
      name,
      exercises: JSON.stringify(exercisesJson),
      createdBy: adminId,
    });
    return this.planRepo.save(plan);
  }

  async updatePlan(planId: number, name?: string, exercisesJson?: any) {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (name) plan.name = name;
    if (exercisesJson) plan.exercises = JSON.stringify(exercisesJson);
    return this.planRepo.save(plan);
  }

  async deletePlan(planId: number) {
    await this.userPlanRepo.delete({ planId });
    await this.planRepo.delete(planId);
    return { message: 'Plan deleted' };
  }

  async getAllPlans() {
    const plans = await this.planRepo.find({ order: { createdAt: 'DESC' } });
    return plans.map((p) => ({ ...p, exercises: JSON.parse(p.exercises) }));
  }

  async getPlan(planId: number) {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    return { ...plan, exercises: JSON.parse(plan.exercises) };
  }

  // ─── User Plans ───────────────────────────────────────────────────────────────

  async assignPlanToUser(userId: number, planId: number, customWeights?: Record<string, number>) {
    // Remove existing assignment for this plan type if exists
    const existing = await this.userPlanRepo.findOne({ where: { userId, planId } });
    if (existing) await this.userPlanRepo.delete(existing.id);

    const up = this.userPlanRepo.create({
      userId,
      planId,
      customWeights: customWeights ? JSON.stringify(customWeights) : null,
    });
    return this.userPlanRepo.save(up);
  }

  async assignPlanToAll(planId: number, userIds: number[]) {
    const results = await Promise.all(
      userIds.map((uid) => this.assignPlanToUser(uid, planId)),
    );
    return results;
  }

  async getUserPlans(userId: number) {
    const plans = await this.userPlanRepo.find({
      where: { userId },
      relations: ['plan'],
    });
    return plans.map((up) => ({
      ...up,
      customWeights: up.customWeights ? JSON.parse(up.customWeights) : {},
      plan: { ...up.plan, exercises: JSON.parse(up.plan.exercises) },
    }));
  }

  async updateCustomWeights(userId: number, planId: number, customWeights: Record<string, number>) {
    const up = await this.userPlanRepo.findOne({ where: { userId, planId } });
    if (!up) throw new NotFoundException('Plan not assigned to user');
    up.customWeights = JSON.stringify(customWeights);
    return this.userPlanRepo.save(up);
  }
}
