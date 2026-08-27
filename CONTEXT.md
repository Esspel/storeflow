# StoreFlow - Domain Context

## Overview

StoreFlow is a retail store management application for Swedish grocery stores (Coop). It helps store managers and employees manage:

- **Tasks & Checklists** (Uppgifter) - Daily routines and compliance checklists
- **Incidents** (Avvikelser) - Reporting and tracking issues
- **Scheduling** (Schema) - Shift planning and overview
- **Customer Rounds** (Kundrunda) - Store inspection walks
- **Customer Requests** (Kundönskemål) - Product requests from customers
- **Reports** (Rapporter) - KPIs and insights (manager only)
- **Shelf Analytics** (Hyllanalys) - Planogram compliance checking via posemesh CV
- **Store Setup Wizard** - Guided onboarding for new stores (QR portals → Digital Twin → Product Registration)

## Key Concepts

### User Roles & Hierarchy

- **Admin** (HK - Huvudkontor) - Full access across all stores
- **Chef** (Butikschef) - Store manager, manages single store
- **Användare** (Anställd) - Employee, limited access

### Stores & Organization

- Stores belong to **Förening** (cooperative association)
- Föreningar belong to **Distrikt** (district)
- Each user has a primary `store_id` and can have an `active_store_id`

### Core Features

#### Planogram Compliance

- PDF planograms uploaded and parsed into structured data
- Spatial markers (ArUco/QR) placed on shelves for posemesh tracking
- Shelf scans compare observed products vs expected planogram
- Compliance score 0-100% with missing/misplaced/extra product detection

#### posemesh Integration

- Spatial mapping with ArUco markers and QR codes
- 3D coordinate system per store
- Real-time shelf scanning via mobile camera
- Digital twin creation for spatial navigation

#### Offline-First Architecture

- All mutations go through offline queue
- IndexedDB for local persistence
- Background sync when online
- Conflict resolution on reconnect

## Technical Stack

- **Framework**: TanStack Start (React, file-based routing)
- **Database**: Supabase (PostgreSQL + RLS)
- **State**: TanStack Query + React Context
- **Styling**: Tailwind CSS v4 + Radix UI
- **Charts**: Recharts
- **QR/Barcode**: @zxing/browser + qrcode
- **Testing**: Vitest + React Testing Library

## Data Model Highlights

- `app_users` - Users with hierarchy levels
- `stores` - Store information
- `spatial_maps` / `spatial_markers` - posemesh spatial data
- `shelf_planograms` - Expected product positions
- `shelf_observations` - Actual scan results
- `tasks` / `task_completions` - Checklist system
- `incidents` - Issue tracking
- `kundrunda_assignments` - Customer round scheduling
