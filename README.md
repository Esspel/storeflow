# StoreFlow

StoreFlow is a Swedish-language retail operations management platform for coordinating tasks, tracking deviations/incidents, managing staff, and monitoring store performance across multiple locations.

## Tech Stack

- **Frontend:** React 19, TanStack Router/Start, TypeScript
- **Styling:** Tailwind CSS 4.2, Radix UI primitives, shadcn/ui components
- **Database:** Supabase (PostgreSQL with Row-Level Security)
- **Auth:** Custom session-based auth with bcrypt (pgcrypto), role-based access
- **Build:** Vite 7
- **Charts:** Recharts
- **Dates:** date-fns
- **Forms:** React Hook Form + Zod

## Features

### Task Management (Uppgifter)
- Create, assign, and track tasks with checkpoints, questions (text or yes/no), and image attachments
- Recurring tasks (daily, weekly, monthly, etc.) that automatically spawn fresh copies each period
- Template-based task creation from reusable checklist templates
- Group and individual assignment with notification support
- Progress tracking with completion percentages
- CSV export

### Incident/Deviation Reporting (Avvikelser)
- Report incidents with priority levels, categories, and image evidence
- Comments and discussion threads per incident
- SLA deadline tracking
- Status workflow: open, in progress, escalated, resolved, closed

### Staff & Roles (Personal)
- User management with three roles: admin, manager, employee
- User groups for team-based task assignment
- Multi-store user associations

### Templates (Mallar)
- Reusable checklist templates with ordered steps and questions
- Per-store template assignment or global availability
- Question types: free text and yes/no

### Reports (Rapporter)
- Analytics dashboard (manager/admin only)

### Real-time
- Supabase Realtime subscriptions for live task and incident updates

### Time Simulation (Testpanel)
- Developer tool for simulating time passage to test recurring tasks, overdue logic, and SLA deadlines
- Spawned tasks are automatically cleaned up when simulation resets

## Project Structure

```
src/
  routes/           Page components (file-based routing via TanStack Router)
    index.tsx       Dashboard / hub
    uppgifter.tsx   Task management
    avvikelser.tsx  Incident reporting
    mallar.tsx      Templates
    personal.tsx    Staff management
    rapporter.tsx   Reports (restricted to managers/admins)
    installningar.tsx  Settings
    testpanel.tsx   Developer time simulation & test tools
    login.tsx       Authentication
  components/
    app-shell.tsx   Layout wrapper (header, sidebar, notifications)
    app-sidebar.tsx Navigation sidebar
    ui/             shadcn/ui component library
  lib/
    supabase.ts     Supabase client, types, and helper functions
    auth.ts         Session login/logout logic
    auth-context.tsx React context for auth state & active store
    time-simulation.ts Simulated clock offset utilities
    utils.ts        Shared utilities (cn, etc.)
  hooks/
    use-mobile.tsx  Responsive breakpoint hook

supabase/
  migrations/       SQL migration files (schema, RLS policies, functions)
```

## Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project (create one at https://app.supabase.com)

### Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in your Supabase credentials:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
3. Apply database migrations via the Supabase SQL editor or CLI (files in `supabase/migrations/`, run in order)
4. Install dependencies and start:
   ```bash
   npm install
   npm run dev
   ```

### Default Accounts (from seed data)
After running migrations, a default admin account is available. Check the first migration file for credentials.

## Authentication

StoreFlow uses a custom session-based auth system:
- Passwords are hashed with bcrypt via pgcrypto
- Sessions are stored in `app_sessions` with 7-day expiry
- Roles: `admin` (full access), `manager` (store management), `employee` (task execution)
- Row-Level Security enforces data access per user/store

## Database

All tables use RLS. Key tables:
- `app_users`, `app_sessions` — authentication
- `stores`, `user_stores` — multi-store associations
- `tasks`, `task_steps`, `task_questions`, `task_images`, `task_assignees` — task system
- `incidents`, `incident_comments`, `incident_images` — incident reporting
- `checklist_templates`, `checklist_template_items`, `checklist_template_questions` — templates
- `user_groups`, `user_group_members` — team grouping
- `notifications` — in-app notifications
- `audit_log` — action audit trail

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |

## Security Notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in client code
- Change default seed passwords before production use
- All data access is enforced via RLS policies
- Sessions expire after 7 days of inactivity

## License

MIT
