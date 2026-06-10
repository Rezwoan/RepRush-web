import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { ExercisesService } from '../exercises/exercises.service';
import { UserRole } from '../users/user.entity';

// Lower-bound numeric of an estimated-load string ("60kg - 65kg" → 60, "Bodyweight" → 0).
const parseBaseline = (s: string): number => {
  const m = String(s || '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
};

// Build a plan exercise with warm-up sets, working sets, rep range and a baseline load.
const ex = (
  name: string,
  warmUpSets: string[],
  sets: number,
  reps: string,
  estimatedLoad: string,
  bwMultiplier: number,
  rest: number,
  notes: string,
) => ({ name, warmUpSets, sets, reps, estimatedLoad, baselineWeight: parseBaseline(estimatedLoad), bwMultiplier, rest, notes });

const ULPPL_PLANS = [
  {
    name: 'Upper Power',
    exercises: {
      day: 1,
      type: 'Upper Power',
      focus: 'Strength & Power',
      exercises: [
        ex('Barbell Bench Press', ['20kg x 15', '40kg x 8', '50kg x 4'], 3, '5-8', '60kg - 65kg', 0.65, 180, 'Full range of motion, control the descent'),
        ex('Lat Pulldowns (Wide Grip)', ['35kg x 10'], 3, '5-8', '50kg - 55kg', 0.5, 180, 'Squeeze lats at bottom'),
        ex('Overhead Press', ['20kg x 10'], 3, '5-8', '35kg - 40kg', 0.4, 180, 'Brace core, neutral spine'),
        ex('Barbell Rows', ['40kg x 8'], 3, '5-8', '50kg - 55kg', 0.55, 180, 'Pull to lower chest, retract scapulae'),
        ex('Barbell Bicep Curls', ['10kg x 10'], 3, '8-10', '20kg - 25kg', 0.2, 90, 'No swinging'),
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
        ex('Barbell Squats', ['20kg x 15', '40kg x 8', '60kg x 4'], 3, '5-8', '70kg - 75kg', 0.9, 240, 'Below parallel, drive through heels'),
        ex('Romanian Deadlifts', ['60kg x 8'], 3, '5-8', '80kg - 85kg', 0.7, 180, 'Hinge at hips, slight knee bend'),
        ex('Leg Press', ['100kg x 8'], 3, '5-8', '130kg - 150kg', 1.2, 180, 'Full range, no locking knees at top'),
        ex('Lying Leg Curls', ['Muscle already warm'], 3, '5-8', '35kg - 45kg', 0.25, 90, 'Slow eccentric'),
        ex('Standing Calf Raises', ['Muscle already warm'], 3, '8-10', '60kg - 70kg', 0.5, 60, 'Full range, pause at top'),
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
        ex('Incline DB Press', ['10kg DBs x 10', '15kg DBs x 6'], 3, '5-8', '22.5kg - 25kg DBs', 0.25, 120, '30-45 degree incline'),
        ex('Seated DB Press', ['Muscle already warm'], 3, '5-8', '15kg - 17.5kg DBs', 0.2, 90, 'Controlled, full extension'),
        ex('DB Lateral Raises', ['5kg DBs x 10'], 3, '8-12', '7.5kg - 10kg DBs', 0.08, 60, 'Lead with elbows, slight forward lean'),
        ex('Pec Deck Machine Flyes', ['Muscle already warm'], 3, '8-12', '40kg - 50kg', 0.3, 60, 'Squeeze at contraction'),
        ex('EZ Bar Skullcrushers', ['10kg x 10'], 3, '8-12', '20kg - 25kg', 0.15, 90, 'Elbows in, controlled'),
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
        ex('V-Grip Lat Pulldowns', ['35kg x 10'], 3, '5-8', '50kg - 55kg', 0.45, 90, 'Full stretch at top'),
        ex('Chest-Supported T-Bar Row', ['20kg plate x 10'], 3, '5-8', '40kg - 50kg (plates)', 0.35, 90, 'Squeeze at the top'),
        ex('DB Rear Delt Flyes', ['Muscle already warm'], 3, '10-15', '5kg - 7.5kg DBs', 0.08, 60, 'Slight bend in elbows'),
        ex('Incline DB Curls', ['5kg DBs x 10'], 3, '8-12', '10kg - 12.5kg DBs', 0.1, 60, 'Full stretch at bottom'),
        ex('DB Hammer Curls', ['Muscle already warm'], 3, '8-12', '12.5kg - 15kg DBs', 0.1, 60, 'Neutral grip throughout'),
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
        ex('Hack Squats', ['Machine empty x 10', '+40kg x 6'], 3, '5-8', '80kg - 100kg', 0.8, 180, 'Deep range, controlled'),
        ex('Leg Extensions', ['Muscle already warm'], 3, '5-8', '40kg - 50kg', 0.25, 60, 'Squeeze quads at top'),
        ex('Seated Leg Curls', ['Muscle already warm'], 3, '5-8', '40kg - 45kg', 0.2, 60, 'Full range of motion'),
        ex('Seated Calf Raises', ['Muscle already warm'], 3, '10-15', '30kg - 40kg', 0.3, 45, 'Slow and controlled'),
        ex('Core Exercise (User Choice)', ['Muscle already warm'], 3, '8-15', 'Bodyweight or weighted', 0, 60, 'Choose: lying leg raises, cable crunches, decline sit-ups, or ab wheel'),
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
      if (userPlans.length === 0) {
        for (const plan of existing) {
          await this.exercisesService.assignPlanToUser(userId, plan.id).catch(() => {});
        }
      }
      // Refresh the canonical ULPPL plans in place (keeps ids + assignments) so
      // warm-up sets / estimated loads land on already-seeded installs.
      await this.backfillPlans(existing);
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

  /**
   * One-time, idempotent upgrade of already-seeded ULPPL plans: if a plan's
   * exercises don't yet carry warm-up sets, replace its exercise list with the
   * canonical version. Plans are matched by exercise-name overlap (their display
   * names may differ, e.g. "Upper" vs "Upper Power"), so plan ids, user
   * assignments and the user's chosen plan names are all preserved. Custom plans
   * that don't overlap the ULPPL program are left untouched.
   */
  private async backfillPlans(existing: any[]) {
    const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const plan of existing) {
      const exs = plan.exercises?.exercises || [];
      if (!exs.length || exs[0].warmUpSets) continue; // empty or already upgraded
      const names = new Set(exs.map((e: any) => norm(e.name)));
      let best: (typeof ULPPL_PLANS)[number] | null = null;
      let bestScore = 0;
      for (const c of ULPPL_PLANS) {
        const score = c.exercises.exercises.filter((e) => names.has(norm(e.name))).length;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (best && bestScore >= 2) {
        try {
          await this.exercisesService.updatePlan(plan.id, undefined, best.exercises);
          this.logger.log(`Backfilled warm-up/estimated-load data for plan "${plan.name}" (matched ${best.name}, ${bestScore} exercises)`);
        } catch (e) {
          this.logger.warn(`Failed to backfill plan ${plan.name}: ${e.message}`);
        }
      }
    }
  }
}
