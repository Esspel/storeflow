/**
 * Three.js runtime patches — applied before any R3F/Three.js code runs.
 *
 * Three.js r185 deprecerade THREE.Clock in favour of THREE.Timer.
 * @react-three/fiber 9.7.0 still calls `new THREE.Clock()` internally (events store).
 *
 * Workaround: use `Object.defineProperty` on the imported namespace object.
 * ESM forbids `THREE.Clock = ...` (re-assignment) but allows defining a
 * new property on the namespace object — the original bindings remain
 * immutable, but the object itself is extensible.
 */

import * as THREE from "three";

const ns = THREE as unknown as Record<string, unknown>;

if (typeof ns["Clock"] === "undefined" && typeof ns["Timer"] === "function") {
  // THREE.Timer is API-compatible with THREE.Clock for R3F's `getDelta()` use.
  try {
    Object.defineProperty(ns, "Clock", {
      value: ns["Timer"],
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch (_e) {
    /* defensive: do not throw during module init */
  }
}
