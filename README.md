# RepRush 🏋️

A full-featured gym tracking Progressive Web App (PWA) for teams and individuals. Track workouts, monitor progress, compete on leaderboards, and get AI-driven progressive overload recommendations.

## Features

- **Authentication** — Invite-based sign-up, JWT persistence, password management
- **Onboarding** — Multi-step profile setup with completion banner
- **Dashboard** — GitHub-style gym attendance heatmap + daily creatine tracker
- **Workout Logging** — Log sets/reps/weights per session with history
- **Progressive Overload Algorithm** — Smart weight/rep suggestions for next session
- **Leaderboard** — 3 tabs: Relative Strength Score, Wilks Score, Progress Rate
- **Achievements** — Bodyweight-based strength goals with progress bars
- **Admin Panel** — User management, exercise plan assignment, cross-user comparison charts
- **PWA** — Installable on mobile and desktop, works offline

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS, TypeScript, TypeORM |
| Database | SQLite3 (via better-sqlite3) |
| Auth | JWT (httpOnly cookies), bcryptjs |
| Email | Resend |
| PWA | next-pwa |

## Project Structure

```
RepRush/
├── frontend/        # Next.js PWA application
├── backend/         # NestJS REST API
│   └── database/    # SQLite .db file (gitignored)
├── DEVELOPMENT.md   # Architecture & session continuity docs
└── README.md
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### 1. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your values (see .env.example)
npm install
npm run start:dev
```

Backend runs on `http://localhost:3001`

### 2. Frontend Setup

```bash
cd frontend
cp .env.local.example .env.local
# Edit .env.local
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`

### 3. Create Admin Account

After starting the backend, the admin account is auto-seeded. See `DEVELOPMENT.md` for credentials.

## Environment Variables

### Backend (`backend/.env`)
```env
JWT_SECRET=your-secret-key-here
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=RepRush <noreply@your-verified-domain.com>
ADMIN_EMAIL=frezwoan+reprush@gmail.com
ADMIN_PASSWORD=changeme123
PORT=3001
FRONTEND_URL=http://localhost:3000
```

`RESEND_FROM_EMAIL` must use a sender on a verified Resend domain for real invite delivery.

### Frontend (`frontend/.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Git Workflow

- `main` — production-ready code
- `develop` — integration branch
- `feature/*` — individual features
- `fix/*` — bug fixes

## Deployment

Designed to run on a Raspberry Pi (Linux ARM). See `DEVELOPMENT.md` → Deployment section.

## License

Private — All rights reserved.
