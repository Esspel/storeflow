# AR Integration Guide

This document describes the AR (Augmented Reality) integration for StoreFlow using Auki's posemesh network.

## Overview

StoreFlow's AR functionality enables staff and customers to navigate stores in augmented reality, overlay 3D digital twin data, and access spatial information.

## Environment Configuration

### Required Environment Variables

Add the following to your `.env` file:

```bash
# Auki Posemesh Application Credentials
# Get these from your Auki dashboard under Applications
VITE_AUKI_APP_KEY=your-auki-app-key
VITE_AUKI_APP_SECRET=your-auki-app-secret
```

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `VITE_AUKI_APP_KEY` | Auki application public key | Yes (for AR) | - |
| `VITE_AUKI_APP_SECRET` | Auki application secret key | Yes (for AR) | - |

## Architecture

### Core Components

1. **`AukiPosemeshNetwork`** (`src/lib/posemesh/auki-network.ts`)
   - Manages Auki posemesh network connection
   - Provides pose updates and domain data
   - Methods: `initialize()`, `subscribeToPoseUpdates()`, `getDomain()`, `onConnectionChange()`

2. **`useARNetwork`** (`src/hooks/useARNetwork.ts`)
   - React hook for AR network state management
   - Auto-initializes on mount when authenticated
   - Returns: `isConnected`, `isConnecting`, `error`, `pose`, `domain`

3. **`AukiDomainRenderer`** (`src/components/AukiDomainRenderer.tsx`)
   - Renders 3D store domain with markers and navigation paths
   - Integrates with WebXR for AR display
   - Props: `network`, `storeId`, `className`, `onError`

4. **`AROverlay`** (`src/components/AROverlay.tsx`)
   - Camera stream management
   - Combines camera background with 3D overlay
   - Props: `network`, `storeId`, `initialPose`, `className`

### Data Flow

```
[User opens AR view]
        ↓
AROverlay initializes camera stream
        ↓
useARNetwork hook connects to Auki network
        ↓
getSpatialMap loads domain data from database
        ↓
AukiDomainRenderer renders 3D markers overlaid on camera
        ↓
Pose updates from posemesh track user position
```

## Usage

### In SPA Routes (Staff)

```tsx
import { AROverlay } from "@/components/AROverlay";
import { useARNetwork } from "@/hooks/useARNetwork";

// In component
const { isConnected } = useARNetwork();
<AROverlay network={network} storeId={storeId} />
```

### In Customer Navigation

The AR mode is accessible via the "AR" button in customer-nav.tsx. Customers can:
- View 3D store layout overlaid on camera
- Navigate to products visually
- Access product information in context

## Database Tables

| Table | Description |
|-------|-------------|
| `spatial_maps` | Store layout ID and metadata |
| `spatial_markers` | 3D marker positions (shelves, products, zones) |
| `spatial_routes` | Navigation paths between markers |
| `shelf_observations` | Planogram compliance data |

## Offline Support

- AR overlay gracefully falls back to 3D-only view when camera unavailable
- Domain data loads from database, no external network dependency
- Pose tracking degrades gracefully if posemesh unavailable

## Troubleshooting

### "Auki app credentials not configured"

1. Check `.env` file exists with correct variable names
2. Verify `VITE_AUKI_APP_KEY` and `VITE_AUKI_APP_SECRET` are set
3. Restart dev server after environment changes

### Camera Permission Denied

- Ensure HTTPS context (required for camera access)
- Check browser permissions for camera
- Mobile devices may require user gesture to start camera

### No Markers Visible

- Verify `spatial_markers` table has data for the store
- Check `position` values are valid 3D coordinates
- Ensure markers have proper `store_id` association

## Testing

Run the development server:

```bash
npm run dev
```

Navigate to `/spatial-navigation` for staff AR view or `/customer-nav` and select "AR" mode for customer view.