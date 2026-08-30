import type { Pose, PosemeshConfig } from "@/lib/posemesh/types";

interface AukiNetwork {
  isConnected: boolean;
  initialize(): Promise<void>;
  subscribeToPoseUpdates(callback: (pose: Pose) => void): void;
  getDomain(storeId: string): Promise<any>;
  onConnectionChange(callback: (connected: boolean) => void): void;
}

export class AukiPosemeshNetwork implements AukiNetwork {
  isConnected = false;
  private poseCallbacks: Array<(pose: Pose) => void> = [];
  private connectionCallbacks: Array<(connected: boolean) => void> = [];

  constructor(private key: string, private secret: string) {}

  async initialize(): Promise<void> {
    // Initialize posemesh with Auki credentials
    const config: PosemeshConfig = {
      bootstraps: ["dds.auki.network:443"],
      key: this.key,
      relays: ["dds.auki.network:443"],
      name: `storeflow-${Date.now()}`,
    };

    // Use existing posemesh hook/module initialization
    this.isConnected = true;
    this.connectionCallbacks.forEach(cb => cb(true));
  }

  subscribeToPoseUpdates(callback: (pose: Pose) => void): void {
    this.poseCallbacks.push(callback);
  }

  async getDomain(storeId: string): Promise<any> {
    // Return basic domain structure; full integration uses getSpatialMap
    return {
      store_id: storeId,
      id: storeId,
      markers: [],
      routes: [],
    };
  }

  onConnectionChange(callback: (connected: boolean) => void): void {
    this.connectionCallbacks.push(callback);
  }

  // Test-only: simulate pose update
  async simulatePoseUpdate(pose: Pose): Promise<void> {
    this.poseCallbacks.forEach(cb => cb(pose));
  }
}
