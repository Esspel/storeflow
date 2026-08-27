# 0001 - Architecture Overview

## Status

Accepted

## Context

StoreFlow is a retail management application for Swedish Coop stores. It needs to support offline-first operation, real-time spatial tracking via posemesh, and multi-tenant store hierarchies.

## Decision

Use a TanStack Start + Supabase architecture with:

- File-based routing with server/client boundaries
- Supabase RLS for multi-tenancy
- IndexedDB + offline queue for offline-first
- posemesh WASM for spatial tracking
- Component-driven UI with Radix + Tailwind v4

## Consequences

- Server-side auth checks required for all protected routes
- Client components marked with "use client" where needed
- Type-safe database access via generated types
- SPA-like navigation with server rendering

## References

- TanStack Start docs
- Supabase RLS patterns
- posemesh React integration guide
