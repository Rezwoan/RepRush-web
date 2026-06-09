import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { ExercisesService } from '../exercises/exercises.service';
import { UserRole } from '../users/user.entity';

const ULPPL_PLANS = [
  {
    name: 'Upper Power',
    exercises: {
      day: 1,
      type: 'Upper Power',
      focus: 'Strength & Power',
      exercises: [
        { name: 'Barbell Bench Press', sets: 4, reps: '4-6', bwMultiplier: 0.65, rest: 180, notes: 'Full range of motion, control the descent' },
        { name: 'Lat Pulldowns Wide Grip', sets: 4, reps: '4-6', bwMultiplier: 0.5, rest: 180, notes: 'Squeeze lats at bottom' },
        { name: 'Overhead Press', sets: 3, reps: '4-6', bwMultiplier: 0.4, rest: 180, notes: 'Brace core, neutral spine' },
        { name: 'Barbell Rows', sets: 4, reps: '4-6', bwMultiplier: 0.55, rest: 180, notes: 'Pull to lower chest, retract scapulae' },
        { name: 'Barbell Bicep Curls', sets: 3, reps: '8-10', bwMultiplier: 0.2, rest: 90, notes: 'No swinging' },
      ],
    },
  },
  {
    name: 'Lower Power',
    exercises: {
      day: 2,
      type: 'Lower Power',
      focus: 'Strength & Power',
      exercises: [
        { name: 'Barbell Squats', sets: 4, reps: '4-6', bwMultiplier: 0.9, rest: 240, notes: 'Below parallel, drive through heels' },
        { name: 'Romanian Deadlifts', sets: 4, reps: '6-8', bwMultiplier: 0.7, rest: 180, notes: 'Hinge at hips, slight knee bend' },
        { name: 'Leg Press', sets: 4, reps: '8-10', bwMultiplier: 1.2, rest: 180, notes: 'Full range, no locking knees at top' },
        { name: 'Lying Leg Curls', sets: 3, reps: '10-12', bwMultiplier: 0.25, rest: 90, notes: 'Slow eccentric' },
        { name: 'Standing Calf Raises', sets: 4, reps: '12-15', bwMultiplier: 0.5, rest: 60, notes: 'Full range, pause at top' },
      ],
    },
  },
  {
    name: 'Push Hypertrophy',
    exercises: {
      day: 3,
      type: 'Push Hypertrophy',
      focus: 'Chest, Shoulders, Triceps',
      exercises: [
        { name: 'Incline DB Press', sets: 4, reps: '8-12', bwMultiplier: 0.25, rest: 120, notes: '30-45 degree incline' },
        { name: 'Seated DB Press', sets: 3, reps: '10-12', bwMultiplier: 0.2, rest: 90, notes: 'Controlled, full extension' },
        { name: 'DB Lateral Raises', sets: 4, reps: '12-15', bwMultiplier: 0.08, rest: 60, notes: 'Lead with elbows, slight forward lean' },
        { name: 'Pec Deck Machine Flyes', sets: 3, reps: '12-15', bwMultiplier: 0.3, rest: 60, notes: 'Squeeze at contraction' },
        { name: 'EZ Bar Skullcrushers', sets: 3, reps: '10-12', bwMultiplier: 0.15, rest: 90, notes: 'Elbows in, controlled' },
      ],
    },
  },
  {
    name: 'Pull Hypertrophy',
    exercises: {
      day: 4,
      type: 'Pull Hypertrophy',
      focus: 'Back, Biceps, Rear Delts',
      exercises: [
        { name: 'V-Grip Lat Pulldowns', sets: 4, reps: '10-12', bwMultiplier: 0.45, rest: 90, notes: 'Full stretch at top' },
        { name: 'Chest-Supported T-Bar Row', sets: 4, reps: '10-12', bwMultiplier: 0.35, rest: 90, notes: 'Squeeze at the top' },
        { name: 'DB Rear Delt Flyes', sets: 3, reps: '12-15', bwMultiplier: 0.08, rest: 60, notes: 'Slight bend in elbows' },
        { name: 'Incline DB Curls', sets: 3, reps: '10-12', bwMultiplier: 0.1, rest: 60, notes: 'Full stretch at bottom' },
        { name: 'DB Hammer Curls', sets: 3, reps: '10-12', bwMultiplier: 0.1, rest: 60, notes: 'Neutral grip throughout' },
      ],
    },
  },
  {
    name: 'Legs & Core',
    exercises: {
      day: 5,
      type: 'Legs & Core',
      focus: 'Quads, Hamstrings, Calves, Core',
      exercises: [
        { name: 'Hack Squats', sets: 4, reps: '8-12', bwMultiplier: 0.8, rest: 180, notes: 'Deep range, controlled' },
        { name: 'Leg Extensions', sets: 4, reps: '12-15', bwMultiplier: 0.25, rest: 60, notes: 'Squeeze quads at top' },
        { name: 'Seated Leg Curls', sets: 3, reps: '12-15', bwMultiplier: 0.2, rest: 60, notes: 'Full range of motion' },
        { name: 'Seated Calf Raises', sets: 4, reps: '15-20', bwMultiplier: 0.3, rest: 45, notes: 'Slow and controlled' },
        { name: 'Core Exercise (User Choice)', sets: 3, reps: '15-20', bwMultiplier: 0, rest: 60, notes: 'Choose: planks, hanging leg raises, cable crunches' },
      ],
    },
  },
];

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private usersService: UsersService,
    private exercisesService: ExercisesService,
    private config: ConfigService,
  ) {}

  async onModuleInit() {
    const adminId = await this.seedAdmin();
    const userId = await this.seedUser();
    await this.seedWorkoutPlans(adminId, userId);
  }

  private async seedAdmin(): Promise<number> {
    const adminEmail = this.config.get('ADMIN_EMAIL') || 'frezwoan+reprush@gmail.com';
    const existing = await this.usersService.findByEmail(adminEmail);
    if (existing) return existing.id;

    const adminPassword = this.config.get('ADMIN_PASSWORD') || 'RepRush@Admin2025';
    try {
      const { user } = await this.usersService.createUser(adminEmail, 'Rezwoan (Admin)', adminPassword, UserRole.ADMIN);
      this.logger.log(`Admin account created: ${adminEmail}`);
      return user.id;
    } catch (e) {
      this.logger.warn(`Failed to seed admin: ${e.message}`);
      const u = await this.usersService.findByEmail(adminEmail);
      return u?.id || 1;
    }
  }

  private async seedUser(): Promise<number> {
    const userEmail = 'frezwoan@gmail.com';
    const existing = await this.usersService.findByEmail(userEmail);
    if (existing) return existing.id;

    try {
      const { user } = await this.usersService.createUser(
        userEmail,
        'Rezwoan',
        'RepRush@User2025',
        UserRole.USER,
        true, // force activate — seeded users don't need invite flow
      );
      this.logger.log(`Regular user account created: ${userEmail}`);
      return user.id;
    } catch (e) {
      this.logger.warn(`Failed to seed user: ${e.message}`);
      const u = await this.usersService.findByEmail(userEmail);
      return u?.id || 2;
    }
  }

  private async seedWorkoutPlans(adminId: number, userId: number) {
    const existing = await this.exercisesService.getAllPlans();
    if (existing.length > 0) {
      // Make sure user has all plans assigned
      const userPlans = await this.exercisesService.getUserPlans(userId);
      if (userPlans.length === 0 && existing.length > 0) {
        for (const plan of existing) {
          await this.exercisesService.assignPlanToUser(userId, plan.id).catch(() => {});
        }
      }
      return;
    }

    for (const plan of ULPPL_PLANS) {
      try {
        const created = await this.exercisesService.createPlan(adminId, plan.name, plan.exercises);
        await this.exercisesService.assignPlanToUser(userId, created.id);
        this.logger.log(`Created and assigned plan: ${plan.name}`);
      } catch (e) {
        this.logger.warn(`Failed to seed plan ${plan.name}: ${e.message}`);
      }
    }
  }
}
