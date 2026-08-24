declare module "@/lib/posemesh/Posemesh.js" {
  interface EmscriptenModule {
    QRDetection?: {
      detectQRFromLuminance(luminance: Uint8Array, width: number, height: number): unknown[];
    };
    BarcodeDetection?: {
      detectBarcodeFromLuminance(luminance: Uint8Array, width: number, height: number): unknown[];
    };
    ArucoDetection?: {
      detectArucoFromLuminance(
        luminance: Uint8Array,
        width: number,
        height: number,
        markerFormat?: number,
      ): unknown[];
      detectArucoFromLuminanceLandmarkObservations(
        luminance: Uint8Array,
        width: number,
        height: number,
      ): unknown[];
    };
    PoseEstimation?: {
      solvePnP(
        objectPoints: number[],
        imagePoints: number[],
        cameraMatrix: number[],
        distCoeffs: number[],
      ): unknown | null;
    };
    getVersion?: () => string;
    getCommitId?: () => string;
    version?: string;
    commitId?: string;
  }

  function init(config?: { locateFile?: (path: string) => string }): Promise<EmscriptenModule>;

  export default init;
}
