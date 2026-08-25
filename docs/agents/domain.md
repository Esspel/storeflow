# Domain Documentation Configuration

## Layout: single-context

This repository uses a single-context layout:

- **Root context**: `CONTEXT.md` at the repo root
- **Architecture Decision Records**: `docs/adr/` directory

### Consumer Rules

When an agent needs domain context, it MUST:
1. Read `CONTEXT.md` first for the high-level domain overview
2. Check `docs/adr/` for any relevant ADRs
3. Only then proceed with the task

New ADRs should be created in `docs/adr/` using the format `NNNN-short-title.md` (sequential numbering).