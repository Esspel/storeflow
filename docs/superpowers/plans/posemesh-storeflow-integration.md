# Plan: posemesh Integration in StoreFlow (Cactus AI Recreation)

## Status: Phase 1 - posemesh Web SDK Build (COMPLETED ✅)

**Current Status:** Phase 1 complete. Posemesh Web SDK WebAssembly bundle (`Posemesh.js` and `Posemesh.wasm`) successfully compiled and integrated into StoreFlow (`src/lib/posemesh/`).

**Progress:**

- ✅ Generated interface files via `gentool`
- ✅ Built Abseil + protobuf + OpenCV libraries for WebAssembly target
- ✅ Resolved `protoc` & `wasm-opt` linker issues
- ✅ Built main posemesh Web SDK (`Posemesh.js`, `Posemesh.wasm`)
- ✅ Copied SDK artifacts to StoreFlow [`src/lib/posemesh/`](file:///C:/Users/erics/Downloads/storeflow-main/src/lib/posemesh/)
- ✅ Updated `usePosemesh.ts` hooks to use actual SDK with barcode detection support
- ⏳ Next: Phase 2 - Shelf Analytics & Planogram Compliance UI (`shelf-scanner.tsx`, `shelf-analytics.tsx`)

---

## Context

Build Cactus AI's shelf analytics, planogram compliance, spatial task management, and product navigation features **using posemesh** instead of integrating with Cactus AI directly. posemesh provides the underlying spatial computing protocol (computer vision, pose estimation, marker tracking) that Cactus AI was built on top of.

**Key insight**: posemesh Web SDK provides:

- QR code detection (`QRDetection.detectQRFromLuminance`)
- ArUco marker detection (`ArucoDetection.detectArucoFromLuminance`)
- Barcode detection (`BarcodeDetection.detectBarcodeFromLuminance`) - EAN-13, EAN-8, UPC, Code128
- 6DOF pose estimation (`PoseEstimation.solvePnP`)
- Camera-based position tracking via markers

This enables building:

1. **Shelf analytics** - Detect products on shelves via QR/ArUco markers and EAN barcodes
2. **Planogram compliance** - Compare detected layout vs expected planogram
3. **Spatial tasks** - Anchor tasks to physical marker positions
4. **Product navigation** - Route optimization using marker map
5. **Product lookup** - Scan EAN/BNR to look up products in Coop sortiment

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      StoreFlow App                              │
├─────────────────────────────────────────────────────────────────┤
│  Routes (TanStack Router)                                       │
│  ├── / (Dashboard)                                              │
│  ├── /login (Public)                                            │
│  ├── /shelf-analytics (Protected - Planogram data confidential) │
│  ├── /planogram-upload (Protected - Planogram upload UI)        │
│  ├── /spatial-navigation (Protected - 3D store view)            │
│  ├── /customer-nav (Public - Customer navigation)               │
│  └── ... existing routes                                        │
├─────────────────────────────────────────────────────────────────┤
│  Components                                                     │
│  ├── ShelfScanner - Camera + posemesh detection (QR/ArUco/EAN)  │
│  ├── QRGenerator - Generate shelf positioning markers           │
│  ├── PlanogramUpload - PDF upload with parser                   │
│  ├── ProductNavigator - Product search + AR navigation          │
│  ├── CoopProductLookup - EAN/BNR search in Coop sortiment       │
│  └── SpatialTaskManager - Spatial task UI                       │
├─────────────────────────────────────────────────────────────────┤
│  Hooks                                                          │
│  ├── usePosemesh - SDK initialization                           │
│  ├── usePosemeshDetection - Camera + detection loop             │
│  ├── useBarcodeDetection - EAN/barcode scanning                 │
│  └── useCoopProductSearch - Coop product lookup                 │
├─────────────────────────────────────────────────────────────────┤
│  Libraries                                                      │
│  ├── posemesh/ - Vendored SDK + TypeScript wrapper              │
│  ├── spatial-index.ts - Marker database & queries               │
│  ├── planogram-engine.ts - Compliance logic                     │
│  ├── route-optimizer.ts - Pathfinding                           │
│  ├── coop-products.ts - Coop product lookup (EAN/BNR)           │
│  └── pdf-planogram-parser.ts - PDF planogram parsing            │
├─────────────────────────────────────────────────────────────────┤
│  Data Layer (Supabase)                                          │
│  ├── spatial_maps, spatial_markers - 3D marker positions        │
│  ├── shelf_planograms, shelf_observations - Planogram data      │
│  ├── spatial_tasks, spatial_routes - Tasks & navigation         │
│  └── products - Product catalog with EAN/BNR                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: posemesh SDK & Core Infrastructure (COMPLETED)

### 1.1 posemesh Web SDK Build ✅

**Location:** `src/lib/posemesh/`

- `Posemesh.js` - Emscripten JS glue
- `Posemesh.wasm` - WebAssembly binary
- `Posemesh.d.ts` - TypeScript types
- `index.ts` - Wrapper with React hooks

**Build steps completed:**

1. Fixed protobuf `protoc` build for WASM (disabled wasm-opt)
2. Ran cmake for main posemesh SDK with Web target
3. Built with ninja → generated `Posemesh.js`, `Posemesh.wasm`
4. Copied artifacts to `src/lib/posemesh/`
5. Updated `usePosemesh.ts` hooks to use actual SDK

### 1.2 posemesh React Integration ✅

**File: `src/hooks/usePosemesh.ts`**

```typescript
// Core hook for posemesh initialization
export function usePosemesh() {
  // initializePosemesh(), getVersion(), getCommitId()
  // Lifecycle: init → ready → error
}

// Camera + detection loop (QR, ArUco, Barcode)
export function usePosemeshDetection(options: {
  facingMode: "environment" | "user";
  scanIntervalMs?: number;
  onQRDetected: (codes: QRCode[]) => void;
  onBarcodeDetected: (barcodes: Barcode[]) => void;
  onArUcoDetected: (markers: ArUcoMarker[]) => void;
  onPoseEstimated: (pose: Pose) => void;
}) {
  // Manages video stream, canvas, detection interval
  // Returns { start, stop, pause, resume }
}
```

### 1.3 Marker Database & Spatial Index ✅

**File: `src/lib/spatial-index.ts`**

- Store marker positions (x,y,z,rotation) per store
- Marker types: `shelf`, `product`, `zone`, `entrance`, `exit`, `aisle`
- Spatial queries: nearest markers, pathfinding between markers
- Persist in Supabase: `spatial_markers`, `spatial_maps` tables

### 1.4 Supabase Schema Additions ✅

**File: `supabase/migrations/20260823150000_create_spatial_tables.sql`**

- `spatial_maps` - Store spatial map (marker positions)
- `spatial_markers` - Individual markers in 3D space
- `shelf_planograms` - Shelf planograms (expected product positions)
- `shelf_observations` - Real-time shelf observations
- `spatial_tasks` - Spatial tasks anchored to markers
- `spatial_routes` - Navigation routes between markers

---

## Phase 2: Shelf Analytics & Planogram Compliance

### 2.1 Shelf Scanner Component ✅

**File: `src/components/shelf-scanner.tsx`**

- Camera view with posemesh detection overlay
- Detects QR codes (shelf markers), ArUco markers, and EAN barcodes
- On barcode detection: calls `lookupCoopProduct(ean)` and `lookupCoopProductByBnr(bnr)`
- Shows product info with link to Coop sortiment
- Real-time compliance checking against planogram
- Scan session management (start/stop/pause/resume)
- Modal integration in shelf-analytics route

### 2.2 Planogram Engine ✅

**File: `src/lib/planogram-engine.ts`**

- Parse expected product positions from planogram
- Compare detected products (via markers + barcodes) vs expected
- Calculate compliance score (0-100%)
- Identify: missing products, misplaced products, extra products
- Generate actionable remediation tasks

### 2.3 Planogram PDF Upload ✅

**File: `src/components/planogram-upload.tsx`**

- Drag-and-drop PDF upload
- Preview parsed planogram
- Validate against known products
- Import to StoreFlow (creates `shelf_planograms` entries)
- Store PDF in Supabase Storage

### 2.4 Shelf Analytics Route ✅

**File: `src/routes/shelf-analytics.tsx`**

- **Protected route** - requires authentication (planogram data is confidential)
- Redirects to `/login` if not authenticated
- Shelf list with compliance scores
- Search/filter shelves
- Detail view with identified deviations
- "Skanna" button opens ShelfScanner modal
- QRGenerator component for shelf marker generation
- Stats cards (Godkänd/Varning/Kritiskt)

### 2.5 Planogram Upload Route (NEW)

**File: `src/routes/planogram-upload.tsx`** (to create)

- Protected route - requires authentication
- Embeds PlanogramUpload component
- Store selector (if multi-store)
- Success handling → redirect to shelf-analytics

---

## Phase 3: QR/ArUco Marker Generation for Shelf Positioning

### 3.1 QR/ArUco Generator Component ✅

**File: `src/components/qr-generator.tsx`**

- Generates QR codes and ArUco markers for posemesh spatial positioning
- Configuration: shelf ID, name, ArUco ID, size (meters), position (left/center/right)
- Types: combined (QR+ArUco), ArUco only, QR only
- Single marker generation
- Batch generation (left/center/right)
- Printable A4 sheet generation
- Download PNG, copy JSON content, print sheet
- Instructions for physical placement

### 3.2 Integration in Shelf Analytics ✅

- QRGenerator embedded in shelf-analytics route
- Staff can generate markers for selected shelf
- Markers include shelf ID, position, ArUco ID for pose estimation

---

## Phase 4: Product Search & Navigation with EAN/Coop Lookup

### 4.1 Coop Product Lookup ✅

**File: `src/lib/coop-products.ts`**

```typescript
interface CoopProduct {
  name: string;
  ean?: string; // EAN-13 or EAN-8
  bnr?: string; // Coop article number (BNR)
  brand?: string;
  size?: string;
  category?: string;
  price?: number;
  imageUrl?: string;
  productUrl?: string; // Link to Mitt Coop sortiment
}

export async function lookupCoopProduct(ean: string): Promise<CoopProduct | null>;
export async function lookupCoopProductByBnr(bnr: string): Promise<CoopProduct | null>;
export async function searchCoopProducts(query: string): Promise<CoopProduct[]>;
export async function getCoopCategories(): Promise<string[]>;
```

- Mock database with common Swedish grocery products (Gevalia, Zoégas, Arla, etc.)
- Search by EAN or BNR
- Returns product with link to `https://www.coop.se/handla/varor/...`
- In production: connect to Coop API

### 4.2 Barcode Detection Integration ✅

**File: `src/hooks/usePosemesh.ts`** (extended)

- Added `BarcodeDetection` module interface
- Added `onBarcodeDetected` callback in `usePosemeshDetection`
- Detects EAN-13, EAN-8, UPC-A, UPC-E, Code128
- Called from ShelfScanner when barcode detected
- Triggers Coop product lookup automatically

### 4.3 Product Navigator Component

**File: `src/components/product-navigator.tsx`** (to create)

- Search products by name, EAN, or BNR
- Shows product info with Coop sortiment link
- If product has spatial marker: "Navigate to product" button
- AR arrow guidance using camera + markers
- Shopping list mode: optimize route for multiple products

### 4.4 Product Location Mapping

**File: `src/lib/product-location.ts`** (to create)

- Map product IDs (EAN/BNR) to shelf markers
- Maintain product location index in `spatial_markers`
- Support multiple locations per product (primary + secondary facings)
- Link from planogram expected products to markers

### 4.5 Route Optimizer

**File: `src/lib/route-optimizer.ts`** (to create)

- Build graph from `spatial_routes` table
- A* pathfinding between markers
- Multi-stop optimization (traveling salesman approximation)
- Return turn-by-turn directions with marker references

### 4.6 Spatial Navigation Route

**File: `src/routes/spatial-navigation.tsx`** (to create)

- Protected route
- Product search + navigator component
- 3D store view with marker positions (using spatial-index)
- AR camera view with pose estimation

### 4.7 Customer Navigation Route (Public)

**File: `src/routes/customer-nav.tsx`** (to create)

- Public route (no auth required)
- Enter store → scan entrance marker → get map
- Search product → follow AR arrows
- Accessible via QR code at store entrance
- Simplified UI for customers

---

## Phase 5: Integration with Existing Features

### 5.1 Kundrunda Enhancement

- Add spatial checkpoints (markers at zone entrances)
- Auto-verify checkpoint completion via position
- AR guidance to next checkpoint

### 5.2 Avvikelser (Incidents) Enhancement

- Auto-create incident from planogram non-compliance
- Attach shelf observation photos as evidence
- Navigate to incident location

### 5.3 Mallar (Templates) Enhancement

- Add spatial steps to checklists
- "Verify shelf X matches planogram" step type
- Auto-populate from latest shelf scan

### 5.4 Schema/Uppgifter Enhancement

- Spatial task creation from templates
- Recurring spatial tasks (daily shelf checks)
- Integration with existing task assignment

---

## Reusable Existing Patterns

| Feature              | Existing Pattern                  | Reuse Location                   |
| -------------------- | --------------------------------- | -------------------------------- |
| Camera access        | `camera-scanner.tsx`              | `usePosemeshDetection`           |
| Photo capture/upload | `PhotoViewer`, `uploadAttachment` | Shelf observation photos         |
| Offline queue        | `mutateWithQueue`                 | Offline shelf scans              |
| Real-time updates    | Supabase Realtime in routes       | Task updates, shelf observations |
| Multi-store scoping  | `store_id` in all tables          | Spatial maps per store           |
| Role-based access    | `app_users.role` + RLS            | Spatial data access control      |
| Audit logging        | `logAudit`                        | Spatial actions audit trail      |
| CSV export           | `exportCSV`                       | Shelf analytics reports          |

---

## Critical Files to Modify / Create

| File                                                           | Purpose                                       | Status       |
| -------------------------------------------------------------- | --------------------------------------------- | ------------ |
| `src/hooks/usePosemesh.ts`                                     | Core posemesh integration + barcode detection | ✅ Done      |
| `src/lib/posemesh/`                                            | Vendored SDK + TypeScript wrapper             | ✅ Done      |
| `src/lib/spatial-index.ts`                                     | Marker database & queries                     | ✅ Done      |
| `src/lib/planogram-engine.ts`                                  | Compliance logic                              | ✅ Done      |
| `src/lib/pdf-planogram-parser.ts`                              | PDF planogram parsing                         | ✅ Done      |
| `src/lib/coop-products.ts`                                     | Coop product lookup (EAN/BNR)                 | ✅ Done      |
| `src/lib/route-optimizer.ts`                                   | Pathfinding                                   | ⏳ To create |
| `src/lib/product-location.ts`                                  | Product-to-marker mapping                     | ⏳ To create |
| `src/components/shelf-scanner.tsx`                             | Shelf scanning UI + barcode scanning          | ✅ Done      |
| `src/components/qr-generator.tsx`                              | Shelf marker generation                       | ✅ Done      |
| `src/components/planogram-upload.tsx`                          | Planogram PDF upload                          | ✅ Done      |
| `src/components/product-navigator.tsx`                         | Product search + AR navigation                | ⏳ To create |
| `src/components/coop-product-lookup.tsx`                       | Standalone EAN/BNR search                     | ⏳ To create |
| `src/routes/shelf-analytics.tsx`                               | Analytics dashboard                           | ✅ Done      |
| `src/routes/planogram-upload.tsx`                              | Planogram upload page                         | ⏳ To create |
| `src/routes/spatial-navigation.tsx`                            | 3D store view + AR nav                        | ⏳ To create |
| `src/routes/customer-nav.tsx`                                  | Public customer nav                           | ⏳ To create |
| `supabase/migrations/20260823150000_create_spatial_tables.sql` | Database schema                               | ✅ Done      |
| `supabase/migrations/20260823140000_create_products_table.sql` | Products table with EAN/BNR                   | ✅ Done      |

---

## Authentication & Security

### Planogram Data Protection

- All planogram routes (`/shelf-analytics`, `/planogram-upload`, `/spatial-navigation`) require authentication
- Implemented via `useAuth()` hook check in component
- Redirect to `/login` with `replace: true` if not authenticated
- Planogram PDFs stored in Supabase Storage with RLS policies
- `shelf_planograms` table has RLS: only authenticated users in same store can read

### Public Routes (No Auth Required)

- `/login` - Login page
- `/customer-nav` - Customer navigation (accessible via entrance QR)
- `/pulstavla` - Public display board

---

## Verification Checklist

- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] Build succeeds (`npm run build`)
- [ ] All protected routes redirect to login when unauthenticated
- [ ] ShelfScanner detects QR, ArUco, and barcodes
- [ ] Barcode detection triggers Coop product lookup
- [ ] Product lookup returns link to Coop sortiment
- [ ] QRGenerator creates valid QR/ArUco markers
- [ ] Planogram upload parses PDF and imports to DB
- [ ] Shelf analytics shows compliance scores
- [ ] Spatial navigation shows 3D marker map
- [ ] Customer nav works without authentication
- [ ] All routes accessible via navigation/app-shell

---

## Implementation Priority

1. **Create missing routes**: `planogram-upload.tsx`, `spatial-navigation.tsx`, `customer-nav.tsx`
2. **Create missing components**: `product-navigator.tsx`, `coop-product-lookup.tsx`
3. **Create missing libraries**: `route-optimizer.ts`, `product-location.ts`
4. **Add navigation links** in AppShell for new routes
5. **Verify build** and fix any TypeScript errors
6. **Test auth protection** on all planogram routes
