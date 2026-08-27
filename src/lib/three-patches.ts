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

// Defensiv: se till att Canvas-klass från R3F inte kastas på THREE-namnet
if (typeof (ns as any).Canvas === "undefined") {
  try {
    // Om R3F försöker referera THREE.Canvas, låt det fallera tyst
    // utan att bryta hela appen. Ingen action behövs — R3F importerar Canvas själv.
  } catch (_e) {}
}

// Defensiv polyfill för THREE.Vector3.addScaledVector.
// @react-three/drei/Bounds använder .addScaledVector() på position-vektorer,
// och i vissa Three.js-versioner kan metoden saknas på klonade vektorer.
import { Vector3 } from "three";
const v3Proto = (Vector3 as any).prototype;
if (v3Proto && typeof v3Proto.addScaledVector !== "function" && typeof Vector3 !== "undefined") {
  try {
    v3Proto.addScaledVector = function (v: any, s: number) {
      this.x += v.x * s;
      this.y += v.y * s;
      this.z += v.z * s;
      return this;
    };
  } catch (_e) {
    /* defensive */
  }
}

// Extra: säkerställ att klonade Vector3 får addScaledVector (drei/Bounds använder .clone())
const v3 = new Vector3();
if (typeof (v3 as any).addScaledVector !== "function") {
  try {
    (Vector3.prototype as any).addScaledVector = function (v: any, s: number) {
      this.x += v.x * s;
      this.y += v.y * s;
      this.z += v.z * s;
      return this;
    };
  } catch (_e) {}
}

// Patch Vector3.clone() så att klonade instanser behåller addScaledVector
if (typeof Vector3 !== "undefined") {
  const origClone = (Vector3.prototype as any).clone;
  if (origClone) {
    try {
      (Vector3.prototype as any).clone = function () {
        const c = origClone.call(this) as any;
        if (
          typeof c.addScaledVector !== "function" &&
          typeof (Vector3.prototype as any).addScaledVector === "function"
        ) {
          c.addScaledVector = (Vector3.prototype as any).addScaledVector;
        }
        return c;
      };
    } catch (_e) {}
  }
}
