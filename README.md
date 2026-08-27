# StoreFlow

StoreFlow is a management tool for retail stores. It helps store managers and staff handle daily routines — tasks, incidents, scheduling, and shelf compliance checks — from a mobile-first PWA.

## What it does

**Daily operations**

- Tasks and checklists — create routines and track completion
- Incidents — log issues with photos, severity, and follow-up
- Customer rounds — structured store inspections on a schedule
- Customer requests — collect product requests via QR code or directly in the app
- Scheduling — shift planning and overview for managers

**Reports and analytics**

- Dashboard with KPIs (manager access only)
- Shelf compliance scanning — compare planograms against actual shelf observations to find missing or misplaced products

**Roles**

- Admin (HK) — full access across all stores
- Chef — manages a single store
- Användare — employee with limited access

## How it works

The frontend talks to Supabase (PostgreSQL + Row Level Security). Sessions are custom tokens stored in secure storage, validated through the `secure-login` edge function and the `app_sessions` table — RLS policies read the active token to authorize requests. Mutations queue offline and sync when connectivity returns.

QR codes and ArUco markers placed on shelves enable spatial mapping — the app uses your camera to scan shelves and compare what it sees against the expected planogram.

## Running locally

**Prerequisites**

- Node.js 20+
- A Supabase project

**Setup**

```bash
# Clone and install
git clone https://github.com/Esspel/storeflow
cd storeflow
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Supabase URL and anon key

# Apply migrations in your Supabase project
npx supabase db push

# Start dev server
npm run dev
```

The app runs at `http://localhost:3000`.

**Environment variables**

| Variable                 | Description                        |
| ------------------------ | ---------------------------------- |
| `VITE_SUPABASE_URL`      | Your Supabase project URL          |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (safe to expose) |
| `VITE_VAPID_PUBLIC_KEY`  | Web push public key (optional)     |

## Deploying

Push to GitHub — Netlify auto-builds and deploys from `main`. Supabase migrations are in `supabase/migrations/`.

## Tech stack

TanStack Start · React · Supabase · Tailwind CSS · Radix UI · Recharts · @zxing/browser
