# StoreFlow

![Build Status](https://img.shields.io/badge/build-passing-brightgreen?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![Version](https://img.shields.io/badge/version-1.0.0-orange?style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)

A Swedish-language retail operations platform for coordinating tasks, tracking incidents, managing staff schedules, and monitoring store performance across multiple locations. StoreFlow is a mobile-first progressive web app built on React 19, TanStack Router, and Supabase — designed for daily use by store managers and employees on tablets and phones.

---

## Tech Stack

### Frontend
| Library | Purpose |
|---|---|
| [React 19](https://react.dev) | UI rendering |
| [TanStack Router](https://tanstack.com/router) | File-based, type-safe client-side routing |
| [TanStack Start](https://tanstack.com/start) | Full-stack React framework (SSR/SSG capable) |
| [TanStack Query](https://tanstack.com/query) | Server-state management and caching |
| [Tailwind CSS 4](https://tailwindcss.com) | Utility-first styling |
| [Radix UI](https://www.radix-ui.com) | Accessible, unstyled UI primitives |
| [shadcn/ui](https://ui.shadcn.com) | Pre-built component library on top of Radix |
| [Lucide React](https://lucide.dev) | Icon set |
| [Recharts](https://recharts.org) | Composable charts and analytics |
| [Embla Carousel](https://www.embla-carousel.com) | Touch-friendly carousel |
| [Vaul](https://vaul.emilkowalski.com) | Drawer / bottom-sheet component |
| [Sonner](https://sonner.emilkowal.ski) | Toast notification system |
| [cmdk](https://cmdk.paco.me) | Command palette |
| [date-fns](https://date-fns.org) | Date formatting and arithmetic |
| [react-day-picker](https://daypicker.dev) | Calendar date picker |
| [pdfjs-dist](https://mozilla.github.io/pdf.js) | In-browser PDF rendering |

### Backend & Database
| Service | Purpose |
|---|---|
| [Supabase](https://supabase.com) | PostgreSQL database, Row-Level Security, Auth, Realtime, Storage |
| Supabase Realtime | WebSocket subscriptions for live updates |
| Supabase Storage | Image and file attachment hosting |
| Supabase Edge Functions | Server-side logic (push notifications via Web Push) |

### Forms & Validation
| Library | Purpose |
|---|---|
| [React Hook Form](https://react-hook-form.com) | Performant form state management |
| [Zod](https://zod.dev) | TypeScript-first schema validation |
| [@hookform/resolvers](https://github.com/react-hook-form/resolvers) | Zod integration for React Hook Form |

### Deployment
| Platform | Purpose |
|---|---|
| [Netlify](https://netlify.com) | Primary hosting via `@netlify/vite-plugin-tanstack-start` |
| [Cloudflare](https://cloudflare.com) | Edge deployment via `@cloudflare/vite-plugin` |

### Tooling
| Tool | Purpose |
|---|---|
| [Vite 7](https://vitejs.dev) | Build tool and dev server |
| [TypeScript 5.8](https://www.typescriptlang.org) | Static typing |
| [ESLint](https://eslint.org) | Linting with React Hooks and React Refresh plugins |
| [Prettier](https://prettier.io) | Code formatting |

---

## Features

- **Task Management** — Create, assign, and track tasks with ordered checkpoints, yes/no or text questions, photo requirements, and image attachments. Supports recurring tasks (daily, weekly, monthly, yearly) that auto-spawn fresh copies each period.
- **Template Library** — Reusable checklist templates with ordered steps and questions, assignable per-store or globally.
- **Incident / Deviation Reporting** — Report incidents with priority levels, categories, SLA tracking, image evidence, and threaded comments. Full status workflow: open → in progress → escalated → resolved → closed.
- **Customer Round (Kundrunda)** — Digital store inspection walkthrough with configurable zones, checkpoints, reference photos, defect logging, and automatic task/incident creation from findings.
- **Meetings Module** — Structured meeting types (daily standup, weekly review, etc.) with agenda items, timers, decisions, and task generation from action items.
- **Staff & Roles** — User management with `admin`, `manager`, and `employee` roles. User groups for team-based task assignment. Multi-store user associations.
- **Schedule Management** — CSV import of employee schedules with shift visualization, borrowed/lent shift tracking, and break time management.
- **Delivery Plans** — Import and view weekly delivery plans linked to schedule data.
- **Reports & Analytics** — Manager-only dashboard with charts (Recharts), task completion rates, incident trends, and store-level comparisons.
- **Real-time Updates** — Supabase Realtime WebSocket subscriptions keep the task board and notifications live without polling.
- **Push Notifications** — Web Push API integration with VAPID keys and a Supabase Edge Function (`send-push`) that delivers OS-level notifications when the app is not in focus.
- **Offline Support** — Service worker caches the app shell; pending changes are saved to `localStorage` and synced when connectivity resumes.
- **PDF & Image Viewing** — In-browser PDF rendering via PDF.js and a full-screen photo viewer with zoom.
- **SAP Integration** — Articles can be linked by SAP article ID with a direct deep-link to Mitt Coop (including site ID).
- **Audit Trail** — Every significant action is logged to `audit_log` with actor, entity, and timestamp.
- **Mobile-First PWA** — Installable progressive web app with a bottom FAB for primary actions, responsive layouts, and barcode scanning via both Zebra TC52 hardware scanner and an in-app camera scanner (using the native `BarcodeDetector` API with torch/flashlight support).
- **Admin Test Panel** — Developer tooling for time simulation (testing recurring tasks and SLA deadlines), data integrity checks, RLS policy verification, and bulk cleanup.

---

## Prerequisites

- **Node.js** 18 or later (`node --version` to check)
- **npm**, **yarn**, **pnpm**, or **bun**
- A [Supabase](https://app.supabase.com) project (free tier is sufficient for development)
- (Optional) VAPID keys for Web Push notifications — generate with `npx web-push generate-vapid-keys`

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-org/storeflow.git
cd storeflow
```

### 2. Install dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 3. Configure environment variables

Copy the example file and fill in your Supabase project credentials:

```bash
cp .env.example .env
```

```env
# .env

# Supabase project URL (Project Settings → API → Project URL)
VITE_SUPABASE_URL=https://your-project-ref.supabase.co

# Supabase anonymous/public key — safe to expose in the browser
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Optional: VAPID keys for Web Push notifications
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key
```

> **Note:** Never put `SUPABASE_SERVICE_ROLE_KEY` in client-side environment variables. It is only used inside Supabase Edge Functions where it is injected automatically.

### 4. Apply database migrations

Run all migration files in `supabase/migrations/` in chronological order. The easiest way is via the Supabase dashboard SQL editor, or using the Supabase CLI:

```bash
supabase db push
```

Migrations include schema creation, RLS policies, helper functions (`hash_password`, `verify_password`, `app_current_user_id`), and seed data for a default admin account and Kundrunda checkpoints.

### 5. Start the development server

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite development server with HMR |
| `npm run build` | Build for production (outputs to `dist/`) |
| `npm run build:dev` | Build in development mode (unminified) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint across all source files |
| `npm run format` | Format all files with Prettier |

---

## Project Structure

```
storeflow/
├── public/
│   ├── sw.js                   # Service worker (offline caching + Web Push)
│   ├── manifest.json           # PWA manifest
│   └── *.docx / *.pdf          # Static reference documents
│
├── src/
│   ├── routes/                 # File-based routing (TanStack Router)
│   │   ├── __root.tsx          # Root layout with auth guard
│   │   ├── index.tsx           # Dashboard / hub
│   │   ├── login.tsx           # Authentication
│   │   ├── uppgifter.tsx       # Task management
│   │   ├── avvikelser.tsx      # Incident / deviation reporting
│   │   ├── kundrunda.tsx       # Customer round (store inspection)
│   │   ├── moten.tsx           # Meetings
│   │   ├── mallar.tsx          # Checklist templates
│   │   ├── schema.tsx          # Staff schedule viewer
│   │   ├── personal.tsx        # Staff & user management
│   │   ├── rapporter.tsx       # Reports & analytics
│   │   ├── installningar.tsx   # Settings
│   │   └── testpanel.tsx       # Admin dev tools (time simulation, data checks)
│   │
│   ├── components/
│   │   ├── app-shell.tsx       # Main layout (sidebar, header, notifications)
│   │   ├── app-sidebar.tsx     # Navigation sidebar
│   │   ├── page-header.tsx     # Reusable page header with actions
│   │   ├── photo-viewer.tsx    # Full-screen image lightbox
│   │   ├── push-notification-setup.tsx
│   │   └── ui/                 # shadcn/ui component library
│   │
│   ├── hooks/
│   │   ├── use-mobile.tsx      # Responsive breakpoint detection
│   │   ├── use-barcode-scanner.ts
│   │   └── use-push-notifications.ts
│   │
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client, all TypeScript types, helpers
│   │   ├── auth.ts             # Login / logout / session restoration
│   │   ├── auth-context.tsx    # React context for auth state and active store
│   │   ├── barcode-context.tsx
│   │   ├── time-simulation.ts  # Simulated clock offset for dev/testing
│   │   ├── error-capture.ts
│   │   └── utils.ts            # cn() and other shared utilities
│   │
│   ├── data/
│   │   └── Leveransplan.csv    # Sample delivery plan data
│   │
│   ├── router.tsx              # TanStack Router instance
│   ├── routeTree.gen.ts        # Auto-generated route tree (do not edit)
│   ├── server.ts               # Server entry point
│   ├── start.ts                # App bootstrap
│   └── styles.css              # Global styles and Tailwind imports
│
├── supabase/
│   ├── migrations/             # Ordered SQL migration files
│   └── functions/
│       └── send-push/          # Edge Function: Web Push delivery
│
├── .env.example                # Environment variable template
├── vite.config.ts
├── tsconfig.json
├── tailwind.config             # Handled via @tailwindcss/vite
├── eslint.config.js
├── netlify.toml                # Netlify deployment config
├── wrangler.jsonc              # Cloudflare Workers config
└── package.json
```

---

## Authentication

StoreFlow uses a custom session-based authentication system built on top of Supabase PostgreSQL (not Supabase Auth):

- Passwords are hashed with **bcrypt** via the `pgcrypto` extension
- Sessions are stored in the `app_sessions` table with a **7-day expiry**
- The session token is sent as a custom `x-session-token` header on every request, validated by RLS helper functions
- **Roles:** `admin` (full platform access), `manager` (store-level management), `employee` (task execution)
- Row-Level Security policies enforce that users can only read and write data belonging to their assigned stores

---

## Database Schema

All tables have RLS enabled. Key tables:

| Group | Tables |
|---|---|
| Auth | `app_users`, `app_sessions` |
| Stores | `stores`, `user_stores` |
| Tasks | `tasks`, `task_steps`, `task_questions`, `task_images`, `task_assignees` |
| Incidents | `incidents`, `incident_comments`, `incident_images` |
| Templates | `checklist_templates`, `checklist_template_items`, `checklist_template_questions` |
| Schedule | `schedule_imports`, `schedule_shifts`, `schedule_employees`, `employee_mappings` |
| Delivery | `delivery_plans`, `delivery_items` |
| Kundrunda | `kundrunda_zones`, `kundrunda_checkpoints`, `kundrunda_sessions`, `kundrunda_responses`, `kundrunda_common_defects`, `kundrunda_defect_checkpoints` |
| Meetings | `meetings`, `meeting_agenda_items`, `meeting_decisions` |
| Groups | `user_groups`, `user_group_members` |
| Notifications | `notifications`, `push_subscriptions` |
| Audit | `audit_log` |

---

## Deployment

### Netlify

The project is pre-configured for Netlify via `netlify.toml` and `@netlify/vite-plugin-tanstack-start`.

```bash
npm run build
# then push to your Git remote connected to Netlify, or:
netlify deploy --prod --dir=dist
```

Set the following environment variables in your Netlify site settings:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_VAPID_PUBLIC_KEY` (if using push notifications)

### Cloudflare

The project includes a `wrangler.jsonc` and `@cloudflare/vite-plugin` for Cloudflare Workers deployment.

```bash
npm run build
npx wrangler deploy
```

---

## Security Notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in client-side code — it bypasses RLS entirely
- Change all default seed passwords before any production deployment
- All database access is enforced via RLS policies — direct table access without a valid session token returns no rows
- Sessions expire after 7 days; expired sessions are cleaned up via the test panel or a scheduled function
- Push notification VAPID private keys must only be stored as Supabase Edge Function secrets

---

## Contributing

Contributions are welcome. Please follow these steps:

1. **Fork** the repository
2. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Commit** your changes with a clear message:
   ```bash
   git commit -m "feat: add export to PDF for reports"
   ```
4. **Push** to your fork and open a **Pull Request** against `main`
5. Ensure `npm run lint` and `npm run build` pass before submitting

Please keep PRs focused on a single concern. For large changes, open an issue first to discuss the approach.

---

## License

MIT © StoreFlow Contributors
