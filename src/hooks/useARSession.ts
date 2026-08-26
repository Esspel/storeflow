/**
 * useARSession Hook
 * Manages WebXR AR session lifecycle
 * Provides session state, features detection, and session controls
 */

import { useState, useEffect, useCallback, useRef } from "react";

export type ARSessionStateType =
  | "unsupported" // WebXR not available
  | "available" // WebXR available but session not started
  | "requesting" // Session request in progress
  | "active" // AR session active
  | "error"; // Error occurred

export interface ARSessionFeatures {
  /** immersive-ar supported */
  immersiveAR: boolean;
  /** hit-test supported */
  hitTest: boolean;
  /** dom-overlay supported */
  domOverlay: boolean;
  /** light-estimation supported */
  lightEstimation: boolean;
}

export interface ARSessionOptions {
  /** DOM element for overlay */
  overlayRoot?: HTMLElement;
  /** Required features */
  requiredFeatures?: string[];
  /** Optional features */
  optionalFeatures?: string[];
  /** Reference space type */
  referenceSpaceType?: "viewer" | "local" | "local-floor" | "bounded-floor" | "unbounded";
}

export interface ARSessionState {
  state: ARSessionState;
  session: XRSession | null;
  features: ARSessionFeatures;
  error: string | null;
  startSession: (options?: ARSessionOptions) => Promise<void>;
  endSession: () => Promise<void>;
  isSupported: boolean;
}

const DEFAULT_REQUIRED_FEATURES = ["hit-test"];
const DEFAULT_OPTIONAL_FEATURES = ["dom-overlay", "light-estimation"];

export function useARSession(): ARSessionState {
  const [state, setState] = useState<ARSessionState>("unsupported");
  const [session, setSession] = useState<XRSession | null>(null);
  const [features, setFeatures] = useState<ARSessionFeatures>({
    immersiveAR: false,
    hitTest: false,
    domOverlay: false,
    lightEstimation: false,
  });
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<XRSession | null>(null);

  // Check WebXR support on mount
  useEffect(() => {
    let mounted = true;

    const checkSupport = async () => {
      if (typeof navigator === "undefined" || !("xr" in navigator)) {
        if (mounted) setState("unsupported");
        return;
      }

      try {
        const xr = (navigator as any).xr as XRSystem;

        // Check immersive-ar support
        const immersiveSupported = await xr.isSessionSupported("immersive-ar");

        if (!immersiveSupported) {
          if (mounted) setState("unsupported");
          return;
        }

        // Query supported features (best-effort)
        const featureSupport: ARSessionFeatures = {
          immersiveAR: true,
          hitTest: false,
          domOverlay: false,
          lightEstimation: false,
        };

        // Try to detect features by checking requested session modes
        // This is heuristic - actual support confirmed during session request
        try {
          const testSession = await xr.requestSession("immersive-ar", {
            requiredFeatures: ["hit-test"],
            optionalFeatures: [],
          });
          featureSupport.hitTest = true;
          await testSession.end();
        } catch {
          // hit-test not supported, continue
        }

        if (mounted) {
          setFeatures(featureSupport);
          setState("available");
        }
      } catch (err) {
        if (mounted) {
          console.error("Error checking WebXR support:", err);
          setState("unsupported");
        }
      }
    };

    checkSupport();

    return () => {
      mounted = false;
    };
  }, []);

  const startSession = useCallback(
    async (options?: ARSessionOptions) => {
      if (state === "unsupported" || state === "requesting" || state === "active") {
        return;
      }

      setState("requesting");
      setError(null);

      try {
        const xr = (navigator as any).xr as XRSystem;

        const sessionInit: XRSessionInit = {
          requiredFeatures: options?.requiredFeatures || DEFAULT_REQUIRED_FEATURES,
          optionalFeatures: options?.optionalFeatures || DEFAULT_OPTIONAL_FEATURES,
        };

        // Add DOM overlay if root provided
        if (options?.overlayRoot) {
          sessionInit.domOverlay = {
            root: options.overlayRoot,
          };
        }

        const newSession = await xr.requestSession(
          "immersive-ar",
          sessionInit
        );

        sessionRef.current = newSession;
        setSession(newSession);
        setState("active");

        // Setup session end handler
        newSession.addEventListener("end", () => {
          sessionRef.current = null;
          setSession(null);
          setState("available");
        });
      } catch (err: any) {
        console.error("Failed to start AR session:", err);
        setError(err?.message || "Failed to start AR session");
        setState("error");
      }
    },
    [state]
  );

  const endSession = useCallback(async () => {
    if (sessionRef.current) {
      try {
        await sessionRef.current.end();
      } catch (err) {
        console.error("Error ending AR session:", err);
      }
      sessionRef.current = null;
      setSession(null);
      setState("available");
    }
  }, []);

  return {
    state,
    session,
    features,
    error,
    startSession,
    endSession,
    isSupported: state !== "unsupported",
  };
}

// Type definitions for WebXR (not in standard lib.dom yet)
// These are minimal definitions needed for the hook

interface XRSessionInit {
  requiredFeatures?: string[];
  optionalFeatures?: string[];
  domOverlay?: { root: HTMLElement };
}

interface XRSession extends EventTarget {
  end(): Promise<void>;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface XRSystem {
  isSessionSupported(sessionMode: string): Promise<boolean>;
  requestSession(sessionMode: string, init?: XRSessionInit): Promise<XRSession>;
}

// Augment Navigator interface
declare global {
  interface Navigator {
    xr?: XRSystem;
  }
}
