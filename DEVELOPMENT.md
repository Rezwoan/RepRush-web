# RepRush — Development Documentation

> This file exists so any AI coding agent (or human) picking up this project cold has full context on decisions made, architecture, and current state.

---

## Architecture Overview

### Backend — NestJS + SQLite

- **Framework**: NestJS (Express adapter)
- **ORM**: TypeORM with `better-sqlite3` driver
- **Database file**: `backend/database/reprush.db` (gitignored, auto-created on first run)
- **Auth**: JWT stored in httpOnly cookies; `bcryptjs` for password hashing
- **Email**: Resend SDK for invitation emails
- **Port**: 3001

#### Module Structure

| Module | Responsibility |
|---|---|
| `AuthModule` | Login, JWT strategy, guards, invite token validation |
| `UsersModule` | User CRUD, profile updates, onboarding progress |
| `WorkoutsModule` | Gym sessions, set/rep logging, personal records |
| `ExercisesModule` | Exercise plans, admin assignment, user-plan mapping |
| `CreatineModule` | Daily creatine dose logging |
| `LeaderboardModule` | Relative Strength Score, Wilks Score, Progress Rate calculations |
| `AchievementsModule` | BW-based strength goals, completion percentages |
| `AdminModule` | Admin-only endpoints: user management, stats, comparisons |
| `MailModule` | Resend email service |

### Frontend — Next.js PWA

- **Framework**: Next.js 14 App Router
- **Styling**: Tailwind CSS + shadcn/ui components
- **PWA**: next-pwa (manifest + service worker auto-generation)
- **State**: React hooks + Context API (no external state library)
- **API Client**: Axios with interceptors; JWT auto-refresh via cookies
- **Port**: 3000

#### Route Structure

```
/login                    — Login page (public)
/onboarding               — Multi-step onboarding (protected)
/dashboard                — Main dashboard: heatmap + creatine (protected)
/workout                  — Workout selection screen (protected)
/workout/session/[id]     — Active workout session (protected)
/profile                  — User profile (protected)
/leaderboard              — Rankings (protected)
/achievements             — Goals & achievements (protected)
/admin                    — Admin dashboard (admin-only)
/admin/users              — User management (admin-only)
/admin/plans              — Exercise plan management (admin-only)
```

---

## Database Schema

### `users`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| email | TEXT UNIQUE | |
| password_hash | TEXT | bcryptjs |
| name | TEXT | |
| role | TEXT | 'user' \| 'admin' |
| height_cm | REAL | nullable |
| weight_kg | REAL | nullable |
| profile_image | TEXT | base64 or URL |
| invite_token | TEXT | used for first-time activation |
| is_activated | INTEGER | 0 \| 1 |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### `onboarding_progress`
| Column | Type |
|---|---|
| id | INTEGER PK |
| user_id | INTEGER FK → users |
| has_profile_image | INTEGER 0\|1 |
| has_height_weight | INTEGER 0\|1 |
| has_prs | INTEGER 0\|1 |
| completed_steps | INTEGER (0-3) |

### `personal_records`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK | |
| exercise_type | TEXT | 'bench' \| 'squat' \| 'deadlift' |
| weight_kg | REAL | |
| reps | INTEGER | |
| date | DATE | |
| season | TEXT | e.g. '2024', '2025' |
| is_current_season | INTEGER 0\|1 | |

### `gym_sessions`
| Column | Type |
|---|---|
| id | INTEGER PK |
| user_id | INTEGER FK |
| workout_plan_id | INTEGER FK → exercise_plans nullable |
| workout_type | TEXT |
| started_at | DATETIME |
| completed_at | DATETIME nullable |
| notes | TEXT nullable |

### `workout_sets`
| Column | Type |
|---|---|
| id | INTEGER PK |
| session_id | INTEGER FK → gym_sessions |
| exercise_name | TEXT |
| set_number | INTEGER |
| target_reps | INTEGER |
| actual_reps | INTEGER |
| weight_kg | REAL |
| logged_at | DATETIME |

### `exercise_plans`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | e.g. 'Push Day', 'Pull Day', 'Leg Day' |
| exercises | TEXT | JSON blob — see Exercise Plan Format |
| created_by | INTEGER FK → users (admin) | |
| created_at | DATETIME | |

### `user_plans`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK | |
| plan_id | INTEGER FK → exercise_plans | |
| custom_weights | TEXT | JSON — per-exercise weight overrides |
| assigned_at | DATETIME | |

### `creatine_logs`
| Column | Type |
|---|---|
| id | INTEGER PK |
| user_id | INTEGER FK |
| amount_grams | REAL |
| logged_at | DATETIME |

---

## Exercise Plan JSON Format

```json
{
  "type": "Push Day",
  "exercises": [
    {
      "id": "bench_press",
      "name": "Bench Press",
      "muscleGroup": "chest",
      "sets": 4,
      "reps": "8-10",
      "restSeconds": 120,
      "notes": "Keep scapula retracted"
    },
    {
      "id": "overhead_press",
      "name": "Overhead Press",
      "muscleGroup": "shoulders",
      "sets": 3,
      "reps": "10-12",
      "restSeconds": 90,
      "notes": ""
    }
  ]
}
```

Admin provides this JSON in the admin panel. The system then distributes it to all users with per-user weight customization stored in `user_plans.custom_weights`.

---

## Progressive Overload Algorithm

Located in `backend/src/workouts/workouts.service.ts` → `suggestNextSession()`

### Logic:
1. Fetch last `N=4` sessions of the same workout type for the user
2. For each exercise, calculate **completion rate** = actual_reps / target_reps
3. Apply rule:
   - ≥ 100% all sets → **increase** weight by 2.5kg (compounds) or 1.25kg (isolation)
   - 80–99% → **maintain** current weight
   - < 80% → **decrease** weight by 5–10%
4. **Baseline comparison**: compare user's 1RM (Epley formula: `w × (1 + r/30)`) against weight-class standards
   - Beginner: bench=0.5×BW, squat=0.75×BW, deadlift=1.0×BW
   - Intermediate: bench=1.0×BW, squat=1.5×BW, deadlift=2.0×BW
   - Advanced: bench=1.5×BW, squat=2.0×BW, deadlift=2.5×BW
5. If user is **above** their baseline → more aggressive progression (+5%)
6. If user is **below** → conservative progression (+2.5%)

---

## Leaderboard Scoring

### Tab 1: Relative Strength Score
```
RSS = (bench_1rm + squat_1rm + deadlift_1rm) / body_weight_kg
```

### Tab 2: Wilks Score (Male coefficients)
```
a = -216.0475144
b = 16.2606339
c = -0.002388645
d = -0.00113732
e = 7.01863e-06
f = -1.291e-08

Wilks = total_kg × (500 / (a + b×BW + c×BW² + d×BW³ + e×BW⁴ + f×BW⁵))
```
Female coefficients also supported (stored in `leaderboard.service.ts`).

### Tab 3: Progress Rate
```
Progress Rate = average weekly improvement % over last 8 weeks
= mean((this_week_total - last_week_total) / last_week_total × 100)
```

---

## Achievements System

Goals are based on bodyweight ratios (best practice in powerlifting):

| Achievement | Target |
|---|---|
| Bench 1× BW | bench_1rm ≥ body_weight_kg |
| Squat 1.5× BW | squat_1rm ≥ 1.5 × body_weight_kg |
| Deadlift 2× BW | deadlift_1rm ≥ 2.0 × body_weight_kg |
| Total 4.5× BW | total_1rm ≥ 4.5 × body_weight_kg |

Progress bars show `current_1rm / target` as a percentage.

---

## Admin Seeding

On first startup (`AppModule` bootstrap), a seed runs if no users exist:
- Admin email: `frezwoan+reprush@gmail.com`
- Password: set via `ADMIN_PASSWORD` env var (default: `RepRush@Admin2025`)
- Role: `admin`

---

## Deployment (Raspberry Pi)

```bash
# On the Pi:
git clone https://github.com/Rezwoan/RepRush.git
cd RepRush

# Backend
cd backend && npm install --production
cp .env.example .env && nano .env  # fill in secrets
npm run build && npm run start:prod

# Frontend
cd ../frontend && npm install
npm run build && npm run start
```

For auto-restart on reboot, use `pm2`:
```bash
pm2 start backend/dist/main.js --name reprush-api
pm2 start frontend/node_modules/.bin/next --name reprush-web -- start -p 3000
pm2 save && pm2 startup
```

Nginx reverse proxy recommended for production (port 80/443).

---

## Git Branches

| Branch | Purpose |
|---|---|
| `main` | Production-ready, tagged releases |
| `develop` | Integration branch |
| `feature/auth` | Auth module |
| `feature/dashboard` | Dashboard + heatmap |
| `feature/workout-logging` | Workout session tracking |
| `feature/admin` | Admin panel |
| `feature/leaderboard` | Rankings |

---

## Session Log

| Date | Work Done |
|---|---|
| 2026-06-09 | Initial project scaffold, full app build |

---

## Outstanding / Future Work

- [ ] Add exercise routine JSON from admin (awaiting user input)
- [ ] Female Wilks coefficients in leaderboard
- [ ] Push notifications for workout reminders (Web Push API)
- [ ] Export user data as PDF report
- [ ] Dark mode toggle
