import React, { useState } from "react";
import { Camera } from "lucide-react";

const CameraScanner = React.lazy(() =>
  import("@/components/camera-scanner").then((m) => ({ default: m.CameraScanner })),
);

interface BarcodeScanButtonProps {
  onScan: (code: string) => void;
}

export function BarcodeScanButton({ onScan }: BarcodeScanButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-input bg-background text-coop-gray-900 transition-colors hover:bg-accent hover:text-accent-foreground"
        title="Scanna med kamera"
      >
        <Camera className="h-4 w-4" />
      </button>
      {open && (
        <React.Suspense fallback={null}>
          <CameraScanner
            onScan={(code) => {
              setOpen(false);
              onScan(code);
            }}
            onClose={() => setOpen(false)}
          />
        </React.Suspense>
      )}
    </>
  );
}
