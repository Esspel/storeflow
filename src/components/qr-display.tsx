import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QrDisplay({ url, size = 200 }: { url: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !url) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 2,
      color: { dark: "#111827", light: "#ffffff" },
    }).catch(() => {});
  }, [url, size]);

  return (
    <canvas
      ref={canvasRef}
      className="rounded-xl"
      style={{ width: size, height: size }}
    />
  );
}
