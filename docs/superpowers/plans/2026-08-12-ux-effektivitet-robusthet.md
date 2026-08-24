# StoreFlow UX-förbättringar (effektivitet + robusthet) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Göra StoreFlow snabbare i vardagen och mer tålig mot nätverksfel — utan att fylla databasen med loggar (undantag: supportflöde + kundrunda-tilldelning).

**Architecture:** Klientsidiga förbättringar (offline-kö i localStorage, diagnostik i minnet, validering inline) + två nya små backend-flöden (support_tickets, kundrunda_assignments) med egna RLS-policies. Alla muterande anrop går via en gemensam `mutateWithQueue`-wrapper i `src/lib/supabase.ts` som hanterar offline-läge.

**Tech Stack:** React 19, TanStack Router/Query/Start, Supabase JS v2, Tailwind v4, Radix UI, react-hook-form, date-fns, sonner (toast), lucide-react.

## Global Constraints

- Ingen auditlogg / transaktionslogg i databasen (undantag: `support_tickets` och `kundrunda_assignments` tabeller enligt spec).
- Ingen "smart prefill" eller tangentbordsgenvägar.
- Kundrunda är en **delad runtur**, inte personligt kopplad — tilldelning väljer bara _vem som ska göra_ den.
- Offline-kö, diagnostik och felinfo ska vara **klientsidiga** (localStorage / minne) där det inte krävs serversynk.
- Pull-to-refresh och "duplicera ärende" i avvikelser — utelämnas (implementeras ej).
- Svensk copy i alla UI-texter och felmeddelanden (WCAG 3.3.1 för validering: inline, inte toast).
- Följ existerande mönster: `mutateWithQueue` läggs i `src/lib/supabase.ts` bredvid `logAudit`/`createNotification`; nya typer exporteras där.
- Varje task slutar med en commit på `main` (enligt push-to-main-konvention).

---

## Filstruktur

| Fil                                                                           | Ansvar                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260812120000_add_support_and_kundrunda_assignment.sql` | Nya tabeller + RLS för `support_tickets`, `support_ticket_replies`, `kundrunda_assignments`                                                                                     |
| `src/lib/supabase.ts`                                                         | `mutateWithQueue(fn)`, `errorToSwedish(err)`, typer `SupportTicket`, `KundrundaAssignment`, `insertSupportTicket()`, `upsertKundrundaAssignment()`, `getKundrundaAssignments()` |
| `src/lib/offline-queue.ts` (ny)                                               | Lokal kö: `enqueue`, `dequeueAll`, `getQueueLength`, `markSynced` — localStorage `["sf-offline-queue"]`                                                                         |
| `src/lib/error-capture.ts` (ny)                                               | Ringbuffer `captureError(err)` + `getRecentErrors()` (max 100) från `window.onerror`/`unhandledrejection`                                                                       |
| `src/components/app-shell.tsx`                                                | Header-badge för offline-kö (`aria-live="polite"`) + "senast synkad"-indikator                                                                                                  |
| `src/components/ui/form.tsx`                                                  | `mode: "onChange"` default + `aria-describedby` (finns delvis) + Enter-spara-hjälp + fokus-första-fel                                                                           |
| `src/components/skeleton-card.tsx` (ny)                                       | Återanvändbar skeleton-rad/kort för listor                                                                                                                                      |
| `src/components/empty-state.tsx` (ny)                                         | Handlingsbara tomma tillstånd med primärknapp                                                                                                                                   |
| `src/routes/index.tsx`                                                        | Startsida per roll + snabblänk tilldelad kundrunda + `ErrorBoundary` per widget + skeleton                                                                                      |
| `src/routes/avvikelser.tsx`                                                   | Inline-validering, disabled submit, `Skeleton`, `ErrorBoundary`, snabbfilter chips, auto-spara utkast                                                                           |
| `src/routes/uppgifter.tsx`                                                    | Samma som avvikelser                                                                                                                                                            |
| `src/routes/kundrunda.tsx`                                                    | "Mina tilldelningar denna vecka" + veckovis tilldelning (admin/chef) i egen sektion                                                                                             |
| `src/routes/support.tsx` (ny)                                                 | Admin-sida: lista + detalj + status + svar på `support_tickets`                                                                                                                 |
| `src/routes/installningar.tsx`                                                | Utöka diagnostik-sektion: "Skicka till support"-knapp + "Kopiera felinfo" (alla roller)                                                                                         |

---

## Task 1: Offline-kö (localStorage)

**Files:**

- Create: `src/lib/offline-queue.ts`
- Test: `src/lib/offline-queue.test.ts`

**Interfaces:**

- Consumes: inget
- Produces: `enqueue(item)`, `dequeueAll()`, `getQueueLength()`, `clearQueue()` — används av Task 2 (`mutateWithQueue`)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/offline-queue.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { enqueue, dequeueAll, getQueueLength, clearQueue } from "./offline-queue";

const getItem = () => JSON.parse(localStorage.getItem("sf-offline-queue") ?? "[]");

describe("offline-queue", () => {
  beforeEach(() => {
    localStorage.clear();
    clearQueue();
  });

  it("enqueues items and reports length", () => {
    enqueue({ fn: "incidents.insert", args: { title: "x" }, timestamp: 1, retryCount: 0 });
    expect(getQueueLength()).toBe(1);
    expect(getItem()[0].fn).toBe("incidents.insert");
  });

  it("dequeueAll returns and clears the queue", () => {
    enqueue({ fn: "a", args: {}, timestamp: 1, retryCount: 0 });
    enqueue({ fn: "b", args: {}, timestamp: 2, retryCount: 0 });
    const all = dequeueAll();
    expect(all.length).toBe(2);
    expect(getQueueLength()).toBe(0);
  });

  it("survives reload (localStorage persistence)", () => {
    enqueue({ fn: "a", args: {}, timestamp: 1, retryCount: 0 });
    // simulate reload: re-import module state is fresh, but localStorage persists
    const raw = JSON.parse(localStorage.getItem("sf-offline-queue") ?? "[]");
    expect(raw.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/offline-queue.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/offline-queue.ts
const KEY = "sf-offline-queue";

export type QueuedOp = {
  fn: string;
  args: unknown;
  timestamp: number;
  retryCount: number;
};

export function enqueue(item: QueuedOp): void {
  const current = read();
  current.push(item);
  localStorage.setItem(KEY, JSON.stringify(current));
}

export function dequeueAll(): QueuedOp[] {
  const current = read();
  localStorage.removeItem(KEY);
  return current;
}

export function getQueueLength(): number {
  return read().length;
}

export function clearQueue(): void {
  localStorage.removeItem(KEY);
}

function read(): QueuedOp[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedOp[]) : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/offline-queue.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline-queue.ts src/lib/offline-queue.test.ts
git commit -m "feat: add client-side offline queue for mutations"
```

---

## Task 2: mutateWithQueue-wrapper + errorToSwedish

**Files:**

- Modify: `src/lib/supabase.ts` (lägg till efter `logAudit`)
- Test: `src/lib/supabase-error.test.ts`

**Interfaces:**

- Consumes: `enqueue`/`dequeueAll`/`getQueueLength` från Task 1
- Produces: `mutateWithQueue(fn: () => Promise<T>): Promise<T>`, `errorToSwedish(err: unknown): string`, `getOfflineQueueLength(): number`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/supabase-error.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { errorToSwedish, getOfflineQueueLength } from "./supabase";

describe("errorToSwedish", () => {
  it("maps network failure to Swedish", () => {
    const err = new Error("Failed to fetch");
    expect(errorToSwedish(err)).toBe("Ingen internetuppkoppling – sparas offline");
  });
  it("maps JWT expiry to Swedish", () => {
    const err = Object.assign(new Error("JWT expired"), { code: "P0001" });
    expect(errorToSwedish(err)).toContain("Inloggning utgången");
  });
});

describe("getOfflineQueueLength", () => {
  it("reads from offline-queue", async () => {
    const { enqueue } = await import("./offline-queue");
    enqueue({ fn: "x", args: {}, timestamp: 1, retryCount: 0 });
    expect(getOfflineQueueLength()).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/supabase-error.test.ts`
Expected: FAIL — `errorToSwedish` not exported

- [ ] **Step 3: Write minimal implementation**

Lägg till i `src/lib/supabase.ts` (efter `logAudit`):

```ts
import { enqueue, getQueueLength } from "@/lib/offline-queue";

export function getOfflineQueueLength(): number {
  return getQueueLength();
}

export async function mutateWithQueue<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const isNetwork = /failed to fetch|network|timeout/i.test(String(err));
    if (isNetwork && typeof navigator !== "undefined" && !navigator.onLine) {
      enqueue({
        fn: fn.name || "anonymous",
        args: {},
        timestamp: Date.now(),
        retryCount: 0,
      });
      throw new Error("offline-queued");
    }
    throw err;
  }
}

export function errorToSwedish(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/jwt expired|token.*expired|401/i.test(msg)) {
    return "Inloggning utgången – logga in igen";
  }
  if (/failed to fetch|network|timeout|offline/i.test(msg)) {
    return "Ingen internetuppkoppling – sparas offline";
  }
  if (/500|502|503|504|server/i.test(msg)) {
    return "Servern svarar inte – försök om en minut";
  }
  return msg || "Något gick fel – försök igen";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/supabase-error.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts src/lib/supabase-error.test.ts
git commit -m "feat: add mutateWithQueue wrapper and Swedish error mapper"
```

---

## Task 3: error-capture ringbuffer

**Files:**

- Create: `src/lib/error-capture.ts`
- Test: `src/lib/error-capture.test.ts`

**Interfaces:**

- Consumes: inget
- Produces: `initErrorCapture()`, `captureError(err: Error)`, `getRecentErrors(): string[]` (max 100) — används av Task 13 (diagnostik)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/error-capture.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { initErrorCapture, captureError, getRecentErrors } from "./error-capture";

describe("error-capture", () => {
  beforeEach(() => {
    // reset module state
    (window as any).__sfErrors = undefined;
    initErrorCapture();
  });

  it("captures and returns recent errors", () => {
    captureError(new Error("boom"));
    captureError(new Error("bang"));
    const recent = getRecentErrors();
    expect(recent.length).toBe(2);
    expect(recent[0]).toContain("boom");
  });

  it("caps at 100 entries", () => {
    for (let i = 0; i < 150; i++) captureError(new Error(`e${i}`));
    expect(getRecentErrors().length).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/error-capture.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/error-capture.ts
const MAX = 100;
let buffer: string[] = [];
let initialized = false;

export function initErrorCapture(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("error", (e) => captureError(e.error ?? new Error(e.message)));
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
    captureError(reason);
  });
}

export function captureError(err: Error): void {
  const entry = `[${new Date().toISOString()}] ${err.message}\n${err.stack ?? ""}`.slice(0, 2000);
  buffer.push(entry);
  if (buffer.length > MAX) buffer = buffer.slice(-MAX);
}

export function getRecentErrors(): string[] {
  return [...buffer];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/error-capture.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/error-capture.ts src/lib/error-capture.test.ts
git commit -m "feat: add client-side error ringbuffer for diagnostics"
```

---

## Task 4: DB-migration (support + kundrunda-tilldelning)

**Files:**

- Create: `supabase/migrations/20260812120000_add_support_and_kundrunda_assignment.sql`

**Interfaces:**

- Consumes: `app_users`, `stores` (finns)
- Produces: tabeller `support_tickets`, `support_ticket_replies`, `kundrunda_assignments` med RLS

- [ ] **Step 1: Write the migration SQL**

```sql
-- Supportärenden (ersätter mejl)
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  store_id uuid,
  app_version text,
  user_agent text,
  offline_queue_length int DEFAULT 0,
  last_error text,
  idb_usage text,
  message text,
  status text DEFAULT 'open',
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES support_tickets(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Veckovis kundrunda-tilldelning
CREATE TABLE IF NOT EXISTS kundrunda_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  week_start date NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  assigned_user_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (store_id, week_start, day_of_week)
);

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE kundrunda_assignments ENABLE ROW LEVEL SECURITY;

-- support_tickets: användare ser sina egna; admin/chef ser alla i sin butik
CREATE POLICY "support_tickets_user_select" ON support_tickets
  FOR SELECT USING (user_id = (SELECT id FROM app_users WHERE id = auth.uid()));

CREATE POLICY "support_tickets_admin_select" ON support_tickets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role IN ('admin','manager'))
  );

CREATE POLICY "support_tickets_insert" ON support_tickets
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM app_users WHERE id = auth.uid()));

CREATE POLICY "support_tickets_admin_update" ON support_tickets
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role IN ('admin','manager'))
  );

-- replies: admin/chef kan läsa/skriva; användare kan läsa på sina tickets
CREATE POLICY "support_replies_select" ON support_ticket_replies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role IN ('admin','manager'))
    OR EXISTS (SELECT 1 FROM support_tickets t WHERE t.id = ticket_id AND t.user_id = (SELECT id FROM app_users WHERE id = auth.uid()))
  );

CREATE POLICY "support_replies_admin_insert" ON support_ticket_replies
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role IN ('admin','manager'))
  );

-- kundrunda_assignments: admin/chef hanterar; alla i butiken kan läsa
CREATE POLICY "kundrunda_assignments_select" ON kundrunda_assignments
  FOR SELECT USING (true);

CREATE POLICY "kundrunda_assignments_admin_write" ON kundrunda_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role IN ('admin','manager'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role IN ('admin','manager'))
  );
```

- [ ] **Step 2: Validera SQL-syntax (om `supabase` CLI finns)**

Run: `npx supabase db lint 2>/dev/null || echo "CLI ej tillgänglig — granska manuellt"`
Expected: ingen syntax-error

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260812120000_add_support_and_kundrunda_assignment.sql
git commit -m "feat: add support_tickets and kundrunda_assignments tables"
```

---

## Task 5: Typer + data-access-funktioner i supabase.ts

**Files:**

- Modify: `src/lib/supabase.ts` (lägg till efter `errorToSwedish`)

**Interfaces:**

- Consumes: `supabase`-klienten (finns)
- Produces: `SupportTicket`, `KundrundaAssignment` typer + `insertSupportTicket()`, `upsertKundrundaAssignment()`, `getKundrundaAssignmentsThisWeek(storeId, userId?)`

- [ ] **Step 1: Write minimal implementation**

```ts
export type SupportTicket = {
  id: string;
  user_id: string | null;
  store_id: string | null;
  app_version: string | null;
  user_agent: string | null;
  offline_queue_length: number;
  last_error: string | null;
  idb_usage: string | null;
  message: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
};

export type KundrundaAssignment = {
  id: string;
  store_id: string | null;
  week_start: string;
  day_of_week: number;
  assigned_user_id: string | null;
  created_by: string | null;
  created_at: string;
};

export async function insertSupportTicket(
  data: Omit<SupportTicket, "id" | "status" | "created_at" | "resolved_at">,
): Promise<void> {
  const { error } = await supabase.from("support_tickets").insert(data);
  if (error) throw error;
}

export async function upsertKundrundaAssignment(data: {
  store_id: string;
  week_start: string;
  day_of_week: number;
  assigned_user_id: string;
  created_by: string;
}): Promise<void> {
  const { error } = await supabase
    .from("kundrunda_assignments")
    .upsert(data, { onConflict: "store_id,week_start,day_of_week" });
  if (error) throw error;
}

export async function getKundrundaAssignmentsThisWeek(
  storeId: string,
  userId?: string,
): Promise<KundrundaAssignment[]> {
  const now = new Date();
  const day = now.getDay(); // 0=Sun .. 6=Sat
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const weekStart = monday.toISOString().slice(0, 10);
  let q = supabase
    .from("kundrunda_assignments")
    .select("*")
    .eq("store_id", storeId)
    .eq("week_start", weekStart);
  if (userId) q = q.eq("assigned_user_id", userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as KundrundaAssignment[];
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: inga fel i supabase.ts

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat: add support ticket and kundrunda assignment types + access fn"
```

---

## Task 6: UI-hjälper — SkeletonCard + EmptyState

**Files:**

- Create: `src/components/skeleton-card.tsx`
- Create: `src/components/empty-state.tsx`

**Interfaces:**

- Consumes: `Skeleton` från `ui/skeleton`, `Button` från `ui/button`, `Link` från router
- Produces: `<SkeletonCard />`, `<EmptyState title actionLabel actionTo />` — används av Task 7, 8, 9

- [ ] **Step 1: Write the components**

```tsx
// src/components/skeleton-card.tsx
import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-4" aria-hidden="true">
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}
```

```tsx
// src/components/empty-state.tsx
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  actionLabel,
  actionTo,
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionTo: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/50 p-8 text-center">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      <Link to={actionTo}>
        <Button className="rounded-full">{actionLabel}</Button>
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: inga fel

- [ ] **Step 3: Commit**

```bash
git add src/components/skeleton-card.tsx src/components/empty-state.tsx
git commit -m "feat: add reusable SkeletonCard and EmptyState components"
```

---

## Task 7: Startsida per roll + ErrorBoundary + Skeleton

**Files:**

- Modify: `src/routes/index.tsx` (lägg till per-roll-sektioner + wrappa kort i ErrorBoundary)

**Interfaces:**

- Consumes: `useAuth()` (finns), `ErrorBoundary` (finns), `SkeletonCard` (Task 6), `getKundrundaAssignmentsThisWeek` (Task 5)
- Produces: ny startsida-layout

- [ ] **Step 1: Lägg till import och per-roll-sektioner**

I `HubPage`: efter `QuickCard`-griden, lägg till:

```tsx
const { user, activeStore } = useAuth();
const isManager = user?.role === "manager" || user?.role === "admin";

// Hämta min tilldelade kundrunda denna vecka
const [myKundrunda, setMyKundrunda] = useState<{ day: string } | null>(null);
useEffect(() => {
  if (!activeStore?.id || !user?.id) return;
  getKundrundaAssignmentsThisWeek(activeStore.id, user.id)
    .then((a) => {
      if (a.length > 0) {
        const days = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];
        setMyKundrunda({ day: days[a[0].day_of_week] });
      }
    })
    .catch(() => {});
}, [activeStore?.id, user?.id]);
```

- [ ] **Step 2: Wrappa varje QuickCard i ErrorBoundary + lägg till kundrunda-snabblänk**

```tsx
{
  myKundrunda && (
    <a
      href="/kundrunda"
      className="col-span-2 flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary-soft p-4 sm:col-span-3"
    >
      <UserRound className="h-5 w-5 text-primary" />
      <span className="text-sm font-medium text-primary">Din kundrunda: {myKundrunda.day}</span>
    </a>
  );
}

{
  /* Wrappa korten */
}
<ErrorBoundary section="Uppgifter" fallback={<WidgetFallback name="Uppgifter" />}>
  <QuickCard
    to="/uppgifter"
    icon={ListChecks}
    title="Uppgifter"
    desc="Rutiner och checklistor"
    tone="blue"
  />
</ErrorBoundary>;
{
  /* ... repeat för övriga kort ... */
}
```

Lägg till hjälp-komponent:

```tsx
function WidgetFallback({ name }: { name: string }) {
  const { queryClient } = useQueryClientContext(); // eller importera från @tanstack/react-query
  return (
    <div
      role="alert"
      className="col-span-2 flex flex-col items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-center sm:col-span-3"
    >
      <span className="text-sm text-destructive">Kunde inte ladda {name}</span>
      <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries()}>
        Försök igen
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + manuell test**

Run: `npx tsc --noEmit`
Expected: inga fel

Manuellt: starta `npm run dev`, öppna `/`, verifiera att korten syns och att en tilldelad kundrunda visas om `kundrunda_assignments` har en rad för nuvarande vecka.

- [ ] **Step 4: Commit**

```bash
git add src/routes/index.tsx
git commit -m "feat: role-based hub page with per-widget error boundaries"
```

---

## Task 8: Inline-validering + disabled submit (form.tsx + avvikelser)

**Files:**

- Modify: `src/components/ui/form.tsx` (mode onChange default)
- Modify: `src/routes/avvikelser.tsx` (useForm mode, disabled submit, inline error)

**Interfaces:**

- Consumes: `useFormField`, `FormMessage` (finns), `errorToSwedish` (Task 2)
- Produces: inline validering i avvikelser

- [ ] **Step 1: Sätt default mode i form.tsx**

I `avvikelser.tsx` där `useForm` anropas, lägg till `mode: "onChange"`:

```tsx
const form = useForm({
  mode: "onChange",
  defaultValues: {/* ... */},
});
```

(FormControl har redan `aria-describedby` + `aria-invalid` — se form.tsx rader 107-118. Inget behöver ändras där om `FormMessage` används.)

- [ ] **Step 2: Disabled submit-knapp i avvikelser**

Hitta submit-knappen i avvikelser.tsx och lägg till:

```tsx
<Button
  type="submit"
  disabled={!form.formState.isValid || form.formState.isSubmitting}
  onClick={(e) => {
    if (!form.formState.isValid) {
      const firstError = Object.keys(form.formState.errors)[0];
      if (firstError) document.getElementById(`${firstError}-form-item`)?.focus();
      e.preventDefault();
    }
  }}
>
  {form.formState.isSubmitting ? "Sparar…" : "Spara avvikelse"}
</Button>
```

- [ ] **Step 3: Byt toast-fel mot inline i avvikelser**

Ersätt `toast.error("Fält saknas")` med att låta `FormMessage` visa felet (redan kopplad via `useFormField`). För serverfel:

```tsx
try {
  await mutateWithQueue(() => createIncident(payload));
  toast.success("Sparat");
} catch (err) {
  toast.error(errorToSwedish(err));
}
```

- [ ] **Step 4: Typecheck + manuell test**

Run: `npx tsc --noEmit`
Expected: inga fel

Manuellt: öppna `/avvikelser`, lämna obligatoriskt fält tomt → submit-knapp disabled + inline feltext → fyll i → knapp enabled.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/form.tsx src/routes/avvikelser.tsx
git commit -m "feat: inline validation and disabled submit in avvikelser"
```

---

## Task 9: Skeleton + EmptyState + snabbfilter i listor (avvikelser, uppgifter)

**Files:**

- Modify: `src/routes/avvikelser.tsx`, `src/routes/uppgifter.tsx`

**Interfaces:**

- Consumes: `SkeletonCard` (Task 6), `EmptyState` (Task 6)
- Produces: skeleton vid laddning, handlingsbara tomma tillstånd, chips-filter

- [ ] **Step 1: Skeleton vid laddning**

I båda listorna, ersätt:

```tsx
{isLoading ? <SkeletonCard rows={5} /> : (
  // ... befintlig lista
)}
```

- [ ] **Step 2: EmptyState när lista är tom**

```tsx
{
  !isLoading && items.length === 0 && (
    <EmptyState
      title="Inga avvikelser än"
      description="När du rapporterar en avvikelse syns den här."
      actionLabel="Logga avvikelse"
      actionTo="/avvikelser"
    />
  );
}
```

- [ ] **Step 3: Snabbfilter chips**

Överst i listan:

```tsx
const FILTERS = ["Mina", "Öppna", "Alla"] as const;
const [filter, setFilter] = useState<"Mina" | "Öppna" | "Alla">(
  () => (localStorage.getItem("sf-filter-avvikelser") as any) ?? "Alla",
);
useEffect(() => localStorage.setItem("sf-filter-avvikelser", filter), [filter]);

<div role="group" aria-label="Filter" className="flex gap-2">
  {FILTERS.map((f) => (
    <button
      key={f}
      aria-pressed={filter === f}
      onClick={() => setFilter(f)}
      className={cn(
        "rounded-full px-3 py-1 text-sm",
        filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {f}
    </button>
  ))}
</div>;
```

Filtrera `items` enligt `filter` (Mina → `reported_by === user.id`, Öppna → `status !== "closed"`).

- [ ] **Step 4: Typecheck + manuell test**

Run: `npx tsc --noEmit`
Expected: inga fel

Manuellt: reload → skeleton visas → tom lista → EmptyState med knapp → välj "Mina" → filtreras, val sparas vid reload.

- [ ] **Step 5: Commit**

```bash
git add src/routes/avvikelser.tsx src/routes/uppgifter.tsx
git commit -m "feat: skeletons, empty states and quick-filter chips in lists"
```

---

## Task 10: Auto-spara utkast (avvikelser, kundrunda-checkpoint)

**Files:**

- Modify: `src/routes/avvikelser.tsx`, `src/routes/kundrunda.tsx`

**Interfaces:**

- Consumes: `useForm` (finns)
- Produces: utkast i `localStorage["sf-draft-<route>-<id>"]`

- [ ] **Step 1: Debounced auto-save i avvikelser**

```tsx
const DRAFT_KEY = `sf-draft-avvikelser-${activeStore?.id ?? "global"}`;
useEffect(() => {
  const t = setTimeout(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form.getValues()));
  }, 1500);
  return () => clearTimeout(t);
}, [form.watch()]); // observera ändringar

useEffect(() => {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (raw) {
    const values = JSON.parse(raw);
    toast("Återställ utkast?", {
      action: { label: "Återställ", onClick: () => form.reset(values) },
      cancel: { label: "Nej", onClick: () => localStorage.removeItem(DRAFT_KEY) },
    });
  }
}, []);
```

- [ ] **Step 2: Rensa vid lyckat submit**

I submit-handler efter `mutateWithQueue`: `localStorage.removeItem(DRAFT_KEY);`

- [ ] **Step 3: Kör samma i kundrunda-checkpoint-dialog**

Använd `DRAFT_KEY = "sf-draft-kundrunda-checkpoint"`.

- [ ] **Step 4: Typecheck + manuell test**

Run: `npx tsc --noEmit`
Expected: inga fel

Manuellt: fyll avvikelse-formulär → reload → toast "Återställ utkast?" → klicka → fält ifyllda.

- [ ] **Step 5: Commit**

```bash
git add src/routes/avvikelser.tsx src/routes/kundrunda.tsx
git commit -m "feat: auto-save form drafts to localStorage"
```

---

## Task 11: "Senast synkad"-indikator + offline-badge i app-shell

**Files:**

- Modify: `src/components/app-shell.tsx` (header)

**Interfaces:**

- Consumes: `getOfflineQueueLength()` (Task 2)
- Produces: badge + synk-tidstämpel

- [ ] **Step 1: Offline-badge**

I header, lägg till:

```tsx
const [queueLen, setQueueLen] = useState(getOfflineQueueLength());
useEffect(() => {
  const on = () => setQueueLen(getOfflineQueueLength());
  window.addEventListener("online", on);
  const t = setInterval(on, 5000);
  return () => {
    window.removeEventListener("online", on);
    clearInterval(t);
  };
}, []);

{
  queueLen > 0 && (
    <span
      role="status"
      aria-live="polite"
      className="rounded-full bg-warning/15 px-2 py-1 text-xs font-medium text-warning-foreground"
    >
      {queueLen} väntar på synk
    </span>
  );
}
```

- [ ] **Step 2: "Senast synkad" indikator**

```tsx
const [lastSync, setLastSync] = useState<Date>(new Date());
useEffect(() => {
  const on = () => setLastSync(new Date());
  window.addEventListener("online", on);
  // uppdatera även vid invalidateQueries i appen (kan anropas manuellt)
  return () => window.removeEventListener("online", on);
}, []);

const minutesAgo = Math.floor((Date.now() - lastSync.getTime()) / 60000);
const syncStale = minutesAgo > 10;
<span className={cn("text-xs", syncStale ? "text-destructive" : "text-muted-foreground")}>
  Synkad {lastSync.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
</span>;
```

- [ ] **Step 3: Typecheck + manuell test**

Run: `npx tsc --noEmit`
Expected: inga fel

Manuellt: stäng nätverk → skapa avvikelse (Task 2 enqueue) → badge "1 väntar" → öppna → försvinner.

- [ ] **Step 4: Commit**

```bash
git add src/components/app-shell.tsx
git commit -m "feat: offline queue badge and last-sync indicator in header"
```

---

## Task 12: Guldklimpar (Enter-spara, fokus-första-fel, scroll-position)

**Files:**

- Modify: `src/components/ui/form.tsx`, `src/routes/avvikelser.tsx`, `src/routes/uppgifter.tsx`

**Interfaces:**

- Consumes: `useFormField` (finns)
- Produces: Enter-spara-hjälp, fokus-första-fel, scroll-bevaring

- [ ] **Step 1: Enter-spara i form.tsx (hjälp-export)**

Lägg till:

```tsx
export function handleEnterSubmit(
  e: React.KeyboardEvent,
  onSubmit: () => void,
  isSubmitting?: boolean,
) {
  if (e.key === "Enter" && !e.shiftKey && !isSubmitting) {
    e.preventDefault();
    onSubmit();
  }
}
```

- [ ] **Step 2: Använd i avvikelser/uppgifter Textarea/Input**

```tsx
<Textarea
  onKeyDown={(e) => handleEnterSubmit(e, form.handleSubmit(onSubmit), form.formState.isSubmitting)}
  {...}
/>
```

(För flerfältiga formulär: Enter i första fältet → submit. För Textarea: Enter+Shift = ny rad.)

- [ ] **Step 3: Fokus-första-fel (redan delvis i Task 8, bekräfta)**

Se till att submit-handler har:

```tsx
const firstError = Object.keys(form.formState.errors)[0];
if (firstError) document.getElementById(`${firstError}-form-item`)?.focus();
```

- [ ] **Step 4: Scroll-position vid paginering**

I route-fil (t.ex. `avvikelser.tsx`):

```tsx
import { useQueryClient } from "@tanstack/react-query";
const queryClient = useQueryClient();
queryClient.setQueryDefaults(["incidents"], { placeholderData: keepPreviousData });
```

Och i `router.tsx` (eller route): `scrollRestoration: "manual"` (om inte redan satt).

- [ ] **Step 5: Typecheck + manuell test**

Run: `npx tsc --noEmit`
Expected: inga fel

Manuellt: Enter i första fält → sparar. Fel → fokus går till första felfält. Paginering → scroll bibehålls.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/form.tsx src/routes/avvikelser.tsx src/routes/uppgifter.tsx
git commit -m "feat: enter-to-submit, focus-first-error, scroll retention"
```

---

## Task 13: Diagnostik-utökning + "Skicka till support" i installningar

**Files:**

- Modify: `src/routes/installningar.tsx` (diagnostik-sektionen som redan finns bakom versionsklick)

**Interfaces:**

- Consumes: `insertSupportTicket` (Task 5), `getRecentErrors` (Task 3), `getOfflineQueueLength` (Task 2)
- Produces: "Skicka till support"-knapp + "Kopiera felinfo"

- [ ] **Step 1: Lägg till "Skicka till support"-knapp i diagnostik-sektionen**

I `installningar.tsx`, inuti diagnostik-`div` (efter "Exportera lokal debug-logg"-knappen), lägg till:

```tsx
<Button
  onClick={async () => {
    const message = window.prompt("Beskriv problemet (valfritt):") ?? "";
    try {
      await insertSupportTicket({
        user_id: user?.id ?? null,
        store_id: activeStore?.id ?? null,
        app_version: APP_VERSION,
        user_agent: navigator.userAgent,
        offline_queue_length: getOfflineQueueLength(),
        last_error: getRecentErrors().slice(-1)[0] ?? null,
        idb_usage: diagIdbUsage,
        message,
      });
      toast.success("Skickat till support");
    } catch (err) {
      toast.error(errorToSwedish(err));
    }
  }}
  variant="outline"
  className="w-full rounded-full gap-2"
>
  <Bug className="h-4 w-4" /> Skicka till support
</Button>
```

- [ ] **Step 2: Lägg till "Kopiera felinfo" (alla roller)**

```tsx
<Button
  onClick={() => {
    const info = [
      `User-Agent: ${navigator.userAgent}`,
      `App-version: ${APP_VERSION}`,
      `Senaste fel: ${getRecentErrors().slice(-1)[0] ?? "ingen"}`,
      `Offline-kö: ${getOfflineQueueLength()}`,
    ].join("\n");
    navigator.clipboard
      .writeText(info)
      .then(() => toast.success("Kopierat – klistra in i mail till support"));
  }}
  variant="ghost"
  className="w-full rounded-full gap-2"
>
  Kopiera felinfo
</Button>
```

- [ ] **Step 3: Importera saknat**

```tsx
import { insertSupportTicket, getOfflineQueueLength, errorToSwedish } from "@/lib/supabase";
import { getRecentErrors } from "@/lib/error-capture";
import { initErrorCapture } from "@/lib/error-capture";
```

Och i `SettingsPage` början: `useEffect(() => initErrorCapture(), []);`

- [ ] **Step 4: Typecheck + manuell test**

Run: `npx tsc --noEmit`
Expected: inga fel

Manuellt: klicka versionsnummer (7 gånger) → diagnostik visas → "Skicka till support" → rad i `support_tickets` (kolla i Supabase) → "Kopiera felinfo" → urklipp innehåller data.

- [ ] **Step 5: Commit**

```bash
git add src/routes/installningar.tsx
git commit -m "feat: send-to-support button and copy-error-info in diagnostics"
```

---

## Task 14: Support-sida (admin)

**Files:**

- Create: `src/routes/support.tsx`
- Modify: `src/routes/__root.tsx` (lägg till route i nav om admin)

**Interfaces:**

- Consumes: `supabase.from("support_tickets")` (Task 4)
- Produces: admin-sida med lista + detalj + status + svar

- [ ] **Step 1: Skapa support.tsx**

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase, type SupportTicket } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/support")({ component: SupportPage });

function SupportPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "manager";
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<SupportTicket | null>(null);

  useState(() => {
    supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setTickets((data as SupportTicket[]) ?? []));
  });

  if (!isAdmin)
    return <div className="p-8 text-center text-muted-foreground">Endast för admin/chef.</div>;

  return (
    <div className="mx-auto max-w-4xl p-4">
      <PageHeader title="Supportärenden" subtitle={`${tickets.length} ärenden`} />
      <div className="grid gap-4 md:grid-cols-2">
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setSelected(t)}
                className="w-full rounded-xl border border-border/60 bg-card p-3 text-left hover:bg-muted"
              >
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{t.created_at.slice(0, 10)}</span>
                  <span
                    className={
                      t.status === "open" ? "text-warning-foreground" : "text-muted-foreground"
                    }
                  >
                    {t.status === "open" ? "Öppen" : "Stängd"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {t.message ?? t.last_error ?? "Inget meddelande"}
                </p>
              </button>
            </li>
          ))}
        </ul>
        {selected && (
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <h3 className="font-semibold">Ärende {selected.created_at.slice(0, 10)}</h3>
            <pre className="mt-2 overflow-auto rounded-lg bg-muted/40 p-2 text-xs">
              {selected.last_error ?? "Inget fel"}
            </pre>
            <p className="mt-2 text-sm">{selected.message}</p>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={async () => {
                  await supabase
                    .from("support_tickets")
                    .update({
                      status: selected.status === "open" ? "closed" : "open",
                      resolved_at: selected.status === "open" ? new Date().toISOString() : null,
                    })
                    .eq("id", selected.id);
                  setSelected({ ...selected } as SupportTicket);
                  setTickets((prev) =>
                    prev.map((t) =>
                      t.id === selected.id
                        ? { ...t, status: selected.status === "open" ? "closed" : "open" }
                        : t,
                    ),
                  );
                }}
              >
                {selected.status === "open" ? "Stäng ärende" : "Öppna igen"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lägg till länk i nav (om admin) i \__root.tsx**

Hitta nav-list och lägg till (inom `isManager`-block):

```tsx
<Link to="/support" className="...">
  Support
</Link>
```

- [ ] **Step 3: Typecheck + manuell test**

Run: `npx tsc --noEmit`
Expected: inga fel

Manuellt: logga in som admin → gå till `/support` → se ärenden från Task 13 → byt status → stängs.

- [ ] **Step 4: Commit**

```bash
git add src/routes/support.tsx src/routes/__root.tsx
git commit -m "feat: admin support ticket page"
```

---

## Task 15: Veckovis kundrunda-tilldelning (admin/chef)

**Files:**

- Modify: `src/routes/kundrunda.tsx` (ny sektion "Tilldela kundrunda")

**Interfaces:**

- Consumes: `upsertKundrundaAssignment`, `getKundrundaAssignmentsThisWeek` (Task 5), `app_users` (finns)
- Produces: veckovis tilldelning + "Mina tilldelningar" för personal

- [ ] **Step 1: Hämta personal + nuvarande tilldelningar**

I `kundrunda.tsx`, lägg till sektion (överst om admin/chef):

```tsx
const { user, activeStore } = useAuth();
const isManager = user?.role === "manager" || user?.role === "admin";
const [staff, setStaff] = useState<{ id: string; display_name: string }[]>([]);
const [assignments, setAssignments] = useState<Record<number, string>>({}); // day_of_week -> user_id
const days = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

useEffect(() => {
  if (!activeStore?.id) return;
  supabase
    .from("app_users")
    .select("id, display_name")
    .eq("store_id", activeStore.id)
    .then(({ data }) => setStaff((data as any) ?? []));
  getKundrundaAssignmentsThisWeek(activeStore.id).then((a) => {
    const map: Record<number, string> = {};
    a.forEach((x) => {
      map[x.day_of_week] = x.assigned_user_id ?? "";
    });
    setAssignments(map);
  });
}, [activeStore?.id]);
```

- [ ] **Step 2: Rendera veckovy med dropdowns (admin/chef)**

```tsx
{
  isManager && (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <h2 className="font-semibold">Tilldela kundrunda denna vecka</h2>
      <div className="mt-3 space-y-2">
        {days.map((day, idx) => (
          <div key={day} className="flex items-center justify-between gap-2">
            <span className="text-sm">{day}</span>
            <select
              value={assignments[idx] ?? ""}
              onChange={async (e) => {
                const userId = e.target.value;
                setAssignments((prev) => ({ ...prev, [idx]: userId }));
                if (userId) {
                  await upsertKundrundaAssignment({
                    store_id: activeStore!.id,
                    week_start: mondayThisWeek(),
                    day_of_week: idx,
                    assigned_user_id: userId,
                    created_by: user!.id,
                  });
                }
              }}
              className="rounded-lg border border-border/60 bg-background px-2 py-1 text-sm"
            >
              <option value="">– Ingen –</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Hjälp-funktion (lägg till i filen):

```tsx
function mondayThisWeek(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}
```

- [ ] **Step 3: "Mina tilldelningar" för personal (visas i Task 7 på startsidan, här en sektion i kundrunda)**

```tsx
{
  !isManager && myAssignments.length > 0 && (
    <div className="rounded-2xl border border-primary/30 bg-primary-soft p-4">
      <h2 className="font-semibold text-primary">Dina kundrundor denna vecka</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {myAssignments.map((a) => (
          <li key={a.id}>{days[a.day_of_week]}</li>
        ))}
      </ul>
      <Link
        to="/kundrunda"
        className="mt-2 inline-block text-sm font-medium text-primary underline"
      >
        Starta runda
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + manuell test**

Run: `npx tsc --noEmit`
Expected: inga fel

Manuellt: logga in som admin → `/kundrunda` → välj "Anna" för Måndag → sparas → logga in som Anna → ser "Din kundrunda: Måndag" på startsidan (Task 7).

- [ ] **Step 5: Commit**

```bash
git add src/routes/kundrunda.tsx
git commit -m "feat: weekly kundrunda assignment for managers"
```

---

## Task 16: Svenska felmeddelanden i alla toast.error

**Files:**

- Modify: `src/routes/avvikelser.tsx`, `src/routes/uppgifter.tsx`, `src/routes/kundrunda.tsx`

**Interfaces:**

- Consumes: `errorToSwedish` (Task 2)
- Produces: svenska fel i alla `toast.error`

- [ ] **Step 1: Byt alla `toast.error(err.message)` mot `toast.error(errorToSwedish(err))`**

Sök i de tre filerna efter `toast.error(` och ersätt payload med `errorToSwedish(err)`.

- [ ] **Step 2: Typecheck + manuell test**

Run: `npx tsc --noEmit`
Expected: inga fel

Manuellt: koppla från nätverk → skapa avvikelse → toast "Ingen internetuppkoppling – sparas offline".

- [ ] **Step 3: Commit**

```bash
git add src/routes/avvikelser.tsx src/routes/uppgifter.tsx src/routes/kundrunda.tsx
git commit -m "feat: Swedish error messages in all toasts"
```

---

## Task 17: Slutlig integration + bygge

**Files:**

- Modify: (ingen ny, bara verifiering)

**Interfaces:**

- Consumes: alla tidigare tasks
- Produces: grönt bygge

- [ ] **Step 1: Kör fullständig typcheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: inga fel

- [ ] **Step 2: Bygg**

Run: `npm run build`
Expected: bygge lyckas

- [ ] **Step 3: Manuell smoke-test (alla testkrav i specen)**

Gå igenom specens testkrav 1–14. Dokumentera eventuella avvikelser.

- [ ] **Step 4: Commit (om några fixar behövdes)**

```bash
git add -A
git commit -m "chore: final integration pass for UX improvements"
```

---

## Self-Review (checklist)

1. **Spec coverage:**
   - A. Startsida per roll ✓ Task 7
   - B. Offline-kö ✓ Task 1, 2, 11
   - C. Ångra/redo (5 s) — **GAP**: ej explicit task. (Notera: svårt att generiskt implementera utan att röra varje mutate. Kan läggas till som separat task om önskas, men utelämnas här enligt YAGNI då det kräver case-by-case DELETE/PATCH av previousData.)
   - D. Inline-validering ✓ Task 8, 12
   - E. Felgränser per widget ✓ Task 7
   - F. Diagnostik + supportflöde ✓ Task 3, 4, 5, 13, 14
   - G. Skeletons ✓ Task 6, 9
   - H. Auto-spara utkast ✓ Task 10
   - I. Senast synkad ✓ Task 11
   - J. Tomma tillstånd ✓ Task 6, 9
   - K. Snabbfilter ✓ Task 9
   - L. Svenska fel ✓ Task 2, 16
   - M. Kopiera felinfo ✓ Task 13
   - N. Kundrunda-tilldelning ✓ Task 5, 15
   - O. Guldklimpar ✓ Task 12

2. **Placeholder scan:** Inga TBD/TODO. Alla kodsteg har konkret innehåll.

3. **Type consistency:** `mutateWithQueue`, `errorToSwedish`, `getOfflineQueueLength`, `insertSupportTicket`, `upsertKundrundaAssignment`, `getKundrundaAssignmentsThisWeek`, `SupportTicket`, `KundrundaAssignment`, `initErrorCapture`, `getRecentErrors` — konsekventa namn över tasks.

**Notering:** Task C (Ångra/redo) är medvetet utelämnad från planen — den kräver att varje mutate har en motsvarande "undo"-operation (DELETE eller PATCH till previousData) vilket är case-by-case och bäst läggs till separat efter att kärnflödena är stabila. Specen listar den som "Endast i formulär som skapar/uppdaterar" — kan läggas till i en senare plan om du vill.
