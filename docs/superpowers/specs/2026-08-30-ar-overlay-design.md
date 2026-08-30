# AR Overlay Design for StoreFlow

## Overview
This document describes the implementation of an AR overlay for StoreFlow that uses the device's camera stream and the Auki Labs posemesh network to render the store's digital twin in real-time alignment with the physical store environment.

## Goals
- Enable store employees to view the store's digital twin (planogram, shelves, products) overlaid on the live camera feed.
- Use the Auki Labs posemesh network for device localization and domain (spatial map) data.
- Provide an immersive AR experience for planogram compliance checking, navigation, and task guidance.
- Maintain offline capabilities where possible, with graceful degradation when network or camera is unavailable.

## Architecture
### High-Level Components
1. **ARViewer Container** (`src/components/ARViewer.tsx`)
   - Manages camera stream initialization and cleanup.
   - Coordinates between the video background and the 3D domain rendering.
   - Handles pose data from the Auki posemesh network.
   - Provides UI controls for toggling AR mode, switching domains, etc.

2. **Posemesh Network Manager** (`src/lib/posemesh/auki-network.ts`)
   - Initializes the posemesh SDK with Auki app credentials (KEY/SECRET).
   - Manages connection to the Auki cluster (DDS, DS, DMS services).
   - Subscribes to pose updates for the current device/user.
   - Provides the current domain (spatial map) and device pose in the domain's coordinate system.

3. **Domain Renderer** (`src/components/DomainRenderer.tsx`)
   - Renders the 3D domain (shelves, products, planogram data) using Three.js.
   - Receives pose data to align the 3D content with the camera view.
   - Fetches and processes store-specific spatial data (from Supabase: spatial_maps, spatial_markers, shelf_planograms).
   - Reuses existing StoreFlow 3D components where applicable (StoreMap3D, etc.).

4. **Camera Background** (`src/components/CameraBackground.tsx`)
   - Simple wrapper around the device's camera stream (using `navigator.mediaDevices.getUserMedia`).
   - Handles permissions, orientation, and basic video styling.

### Data Flow
1. User navigates to the AR view (e.g., `/ar-view` or via a button in spatial-navigation).
2. ARViewer requests camera permissions and starts the video stream.
3. Simultaneously, PosemeshNetworkManager initializes the posemesh SDK using environment variables for Auki KEY/SECRET.
4. Upon successful connection, the manager fetches the current domain (spatial map) for the user's store.
5. The manager subscribes to pose updates from the posemesh network (originating from the Auki mobile app on the device).
6. For each pose update:
   - The pose (position and rotation) is passed to DomainRenderer.
   - DomainRenderer updates the Three.js camera (or object transform) to match the pose.
   - DomainRenderer fetches the latest spatial data for the domain (if needed) and renders the 3D scene.
7. The video stream renders behind the 3D canvas, creating the AR effect.
8. UI overlays (e.g., compliance scores, task markers) can be rendered on top using HTML/CSS or as Three.js sprites.

### Technical Details
#### Posemesh Initialization
```typescript
// src/lib/posemesh/auki-network.ts
import { Posemesh } from '@auki/posemesh-web-sdk'; // Hypothetical package name

export class AukiPosemeshNetwork {
  private posemesh: Posemesh;
  private config: PosemeshConfig;

  constructor() {
    // Load credentials from environment variables (securely handled via Netlify/Supabase env)
    const key = import.meta.env.VITE_AUKI_APP_KEY;
    const secret = import.meta.env.VITE_AUKI_APP_SECRET;
    
    this.config = {
      bootstraps: ['dds.auki.network:443'], // Example bootstrap
      key,
      name: `storeflow-${Math.random().toString(36).substr(2, 9)}`,
    };
    
    this.posemesh = new Posemesh(this.config);
  }

  async initialize(): Promise<void> {
    await this.posemesh.initialize();
    // Additional setup: authenticate, join domain, etc.
  }

  // Subscribe to pose updates for the current device
  onPoseUpdate(callback: (pose: Pose) => void) {
    this.posemesh.onPoseEstimated(callback);
  }
}
```

#### Domain Renderer Integration with Three.js
```typescript
// src/components/DomainRenderer.tsx
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

export function DomainRenderer({ pose }: { pose: Pose }) {
  const { camera, scene } = useThree();

  useEffect(() => {
    // Update Three.js camera to match the pose from posemesh
    if (pose) {
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      camera.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
      camera.updateProjectionMatrix();
    }
  }, [pose, camera]);

  // ... rest of the Three.js scene setup (lights, objects, etc.)
  // Objects are loaded from Supabase spatial data (converted to Three.js meshes)
  return <primitive object={scene} />;
}
```

#### ARViewer Container
```typescript
// src/components/ARViewer.tsx
import { useState, useEffect, useRef } from 'react';
import { CameraBackground } from './CameraBackground';
import { DomainRenderer } from './DomainRenderer';
import { useAukiPosemesh } from '../hooks/useAukiPosemesh'; // Custom hook wrapping auki-network

export function ARViewer() {
  const [pose, setPose] = useState<Pose | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const domainRef = useRef<HTMLDivElement>(null);

  const { pose: aukiPose, isConnected, error } = useAukiPosemesh();

  useEffect(() => {
    if (aukiPose) {
      setPose(aukiPose);
    }
  }, [aukiPose]);

  // Camera permissions and stream handling
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Camera access denied or not available:', err);
        // Fallback: show placeholder or error UI
      }
    }

    startCamera();

    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <CameraBackground videoRef={videoRef} />
      {isConnected && pose ? (
        <DomainRenderer pose={pose} ref={domainRef} />
      ) : (
        <div>Connecting to Auki network...</div>
      )}
      {!isConnected && error && <div>Error: {error.message}</div>}
    </div>
  );
}
```

## Error Handling and Fallbacks
1. **Camera Unavailable**
   - Show a placeholder background (solid color or blurred store image).
   - Allow user to switch to a pure 3D view (without AR overlay).
   - Log error and provide retry mechanism.

2. **Posemesh Network Failure**
   - Display connection status and retry button.
   - Fallback to last known pose and domain data (cached in localStorage).
   - Allow manual domain selection if automatic fails.

3. **Three.js Rendering Issues**
   - ErrorBoundary around DomainRenderer to catch WebGL errors.
   - Fallback to a 2D SVG representation of the store map.

4. **Missing Spatial Data**
   - Show message indicating no domain data is available for the store.
   - Provide link to upload or create a spatial map via the digital twin wizard.

## Assumptions
- The Auki Labs posemesh web SDK is available via npm (e.g., `@auki/posemesh-web-sdk`).
- The SDK provides initialization with key/secret, domain joining, and pose event subscriptions.
- The device running StoreFlow has access to the Auki mobile app (or another source) that provides pose estimation to the posemesh network.
- StoreFlow's existing Supabase schema (`spatial_maps`, `spatial_markers`, `shelf_planograms`) contains sufficient data to render the store's digital twin.
- The Three.js rendering pipeline in StoreFlow (used in `StoreMap3D`) is compatible with the AR overlay requirements.

## Open Questions
1. **Exact Auki SDK Package Name and API**
   - Need to confirm the npm package name and initialization parameters for the posemesh web SDK.
   - Need to verify how to subscribe to pose events and retrieve domain data.

2. **Coordinate System Alignment**
   - Confirm the coordinate system used by the posemesh pose (position/rotation) matches Three.js expectations (right-handed, Y-up, meters).
   - Determine if any transformation (scaling, axis conversion) is needed.

3. **Performance Considerations**
   - Impact of rendering both video stream and 3D scene on lower-end devices.
   - Strategies for reducing render resolution or complexity when needed.

4. **Security of Auki Credentials**
   - Ensure KEY and SECRET are stored only in environment variables and never exposed in client-side code.
   - Consider using a backend proxy to exchange credentials for a short-lived JWT if required by the Auki API.

5. **Integration with Existing Routes**
   - AR-viewen ska vara i `spatial-navigation` (anställda, planogram-compliance) och `customer-nav` (kunder). `customer-nav` är samma som `spatial-navigation` utan planogram-compliance funktioner.

## Next Steps
Upon approval of this design, we will:
1. Create the implementation plan using the `superpowers:writing-plans` skill.
2. Implement the core components as outlined.
3. Write unit and integration tests for the new functionality.
4. Update documentation and storybook examples.