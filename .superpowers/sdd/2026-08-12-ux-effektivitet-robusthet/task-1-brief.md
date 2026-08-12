# Task 1: Offline-kö (localStorage)

## Files:
- Create: `src/lib/offline-queue.ts`
- Test: `src/lib/offline-queue.test.ts`

## Interfaces:
- Consumes: inget
- Produces: `enqueue(item)`, `dequeueAll()`, `getQueueLength()`, `clearQueue()` — används av Task 2 (`mutateWithQueue`)

## Steps:

### Step 1: Write the failing test

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

### Step 2: Run test to verify it fails

Run: `npx vitest run src/lib/offline-queue.test.ts`
Expected: FAIL — module not found

### Step 3: Write minimal implementation

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

### Step 4: Run test to verify it passes

Run: `npx vitest run src/lib/offline-queue.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/lib/offline-queue.ts src/lib/offline-queue.test.ts
git commit -m "feat: add client-side offline queue for mutations"
```

## Global Constraints:
- Ingen auditlogg / transaktionslogg i databasen (undantag: `support_tickets` och `kundrunda_assignments` tabeller enligt spec).
- Alla muterande anrop går via en gemensam `mutateWithQueue`-wrapper i `src/lib/supabase.ts`.
- Svensk copy i alla UI-texter och felmeddelanden.
- Följ existerande mönster: `mutateWithQueue` läggs i `src/lib/supabase.ts` bredvid `logAudit`/`createNotification`; nya typer exporteras där.
- Varje task slutar med en commit på `main`.