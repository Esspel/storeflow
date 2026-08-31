// Three.js runtime patches — MUST be loaded before any R3F/drei/three import.
// Applies polyfills for THREE.Clock (deprecated) and THREE.Vector3.addScaledVector.
import "@/lib/three-patches";

import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
