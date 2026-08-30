# StoreFlow AR Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Auki Domain-Viewer component with posemesh network to enable real-time AR overlay for spatial navigation in both spatial-navigation and customer-nav routes.

**Architecture:** Layered integration where Auki Domain-Viewer provides the 3D domain rendering, posemesh network handles device localization and domain connection, and existing StoreFlow ARNavigationView provides the AR viewport and user controls.

**Tech Stack:** React, TypeScript, Three.js, TanStack Start, Auki Domain-Viewer SDK, posemesh Web SDK, Supabase, WebXR API, StoreFlow's existing posemesh integration (`usePosemesh.ts`), WebRTC, environment variables (`VITE_AUKI_APP_KEY`, `VITE_AUKI_APP_SECRET`)

## Global Constraints
- Must use existing StoreFlow posemesh integration (src/hooks/usePosemesh.ts) but extend it with Auki network support
- Must support both authenticated (spatial-navigation) and public (customer-nav) access patterns
- Must integrate with existing StoreFlow Supabase schema (spatial_maps, spatial_markers, shelf_planograms)
- Must maintain backward compatibility with existing ARNavigationView implementation
- Must support offline mode with graceful degradation
- Must use Secure environment variables (VITE_AUKI_APP_KEY, VITE_AUKI_APP_SECRET) not hardcoded
- Must follow StoreFlow design patterns: React hooks, type-safe, defensive programming, comprehensive error handling
- Must maintain existing routes: /spatial-navigation and /customer-nav
- Existing component: ARNavigationView component in src/components/ARNavigationView.tsx
- Existing hook: usePosemesh hook in src/hooks/usePosemesh.ts

---

### Task 1: Create Auki Network Manager
**Files:**
- Create: `src/lib/posemesh/auki-network.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: Auki KEY/SECRET environment variables, existing `PosemeshConfig` type
- Produces: `AukiNetwork` class with `initialize()`, `subscribeToPoseUpdates()`, `getDomain()`, `onConnectionChange()`

- [ ] **Step 1: Write the failing test**

```typescript
describe("AukiNetwork", () => {
  it("should initialize with Auki credentials", async () => {
    const network = new AukiNetwork("test-key", "test-secret");
    expect(network).toBeDefined();
    await network.initialize();
    expect(network.isConnected).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test src/lib/posemesh/auki-network.ts -v`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
export class AukiPosemeshNetwork {
  isConnected = false;
  constructor(key: string, secret: string) {}
  async initialize(): Promise<void> { this.isConnected = true; }
  subscribeToPoseUpdates(cb: (pose: Pose) => void) {}
  getDomain(id: string): Promise<any> { return Promise.resolve({}); }
}
```

- [ ] **Step 4: Verify pass**
Run: `npm test src/lib/posemesh/auki-network.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**
git add src/lib/posemesh/auki-network.ts
git commit -m "feat: add Auki posemesh network manager"

---

### Task 2: Create Auki Domain Renderer Component
**Files:**
- Create: `src/components/AukiDomainRenderer.tsx`

**Interfaces:**
- Consumes: AukiNetwork instance, SpatialMap from Supabase
- Produces: Component rendering Auki Domain-Viewer with pose alignment

- [ ] Implement component with `useEffect` for pose updates and domain loading
- [ ] Add error handling for offline mode
- [ ] Commit to `src/components/AukiDomainRenderer.tsx`

---

### Task 3: Create AR Network Hook
**Files:**
- Create: `src/hooks/useARNetwork.ts`

**Interfaces:**
- Consumes: Auki KEY/SECRET env vars, existing `usePosemesh` hook
- Produces: `useARNetwork()` hook returning connection state and pose

- [ ] Implement hook with environment variable validation
- [ ] Add connection lifecycle management
- [ ] Include error handling for missing credentials
- [ ] Commit to `src/hooks/useARNetwork.ts`

---

### Task 4: Create AR Overlay Component
**Files:**
- Create: `src/components/AROverlay.tsx`

**Interfaces:**
- Consumes: AukiNetwork instance, pose data, domain data
- Produces: AR overlay combining camera background + 3D renderer

- [ ] Implement camera stream initialization (`getUserMedia`)
- [ ] Integrate `AukiDomainRenderer` as overlay
- [ ] Add session start/end controls
- [ ] Add fallback UI for camera errors
- [ ] Commit to `src/components/AROverlay.tsx`

---

### Task 5: Create AR Domain Service
**Files:**
- Create: `src/lib/digital-twin/ar-domain-service.ts`

**Interfaces:**
- Consumes: Supabase client, Auki Network
- Produces: Service loading domain + compliance data with offline handling

- [ ] Implement `loadStoreData(storeId)` for domain + compliance
- [ ] Add `getActiveProducts()` for planogram products
- [ ] Add offline graceful degradation
- [ ] Commit to `src/lib/digital-twin/ar-domain-service.ts`

---

### Task 6: Integrate with Spatial Navigation Route
**Files:**
- Modify: `src/routes/spatial-navigation.tsx`

**Interfaces:**
- Consumes: `useARNetwork`, `AROverlay`
- Produces: Updated route with AR toggle and component

- [ ] Add `useARNetwork()` hook usage
- [ ] Add `AROverlay` to the 3D/AR section
- [ ] Handle `showAR` state with connection status
- [ ] Add error display for connection failures
- [ ] Verify with existing route tests
- [ ] Commit

---

### Task 7: Integrate with Customer Navigation Route
**Files:**
- Modify: `src/routes/customer-nav.tsx`

**Interfaces:**
- Consumes: `useARNetwork`, `AROverlay`
- Produces: Public AR view with camera overlay

- [ ] Add `useARNetwork()` for public AR access
- [ ] Integrate `AROverlay` in `viewMode === "ar"` section
- [ ] Add public-facing error states (no auth required)
- [ ] Verify with existing route tests
- [ ] Commit

---

### Task 8: Document Environment Variables
**Files:**
- Modify: `.env.example`

**Steps:**
- [ ] Add `VITE_AUKI_APP_KEY` and `VITE_AUKI_APP_SECRET`
- [ ] Add optional bootstrap/relay settings
- [ ] Commit

---

## Testing Setup

- `npm test -- --watch` for development
- Each task has corresponding test file
- Manual testing: camera, network, offline, mobile

## Execution Choice

Plan complete and saved to `docs/superpowers/plans/2026-08-30-ar-overlay-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - Fresh subagent per task with review between tasks
**2. Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`

Which approach? Also, please confirm: should I proceed with the implementation plan using the subagent-driven approach, or do you prefer to start with Task 1 (Auki Network Manager) immediately?
