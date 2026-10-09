# StoreFlow — Claude Code-setup & Projektregler

## Språk & Kommunikation
- Svenska (svenska IT-termer) för svar och commit-meddelanden. Tekniska termer på engelska.

## Plugin- & MCP-konfiguration
- `.claude/settings.json` = globala behörigheter + MCP-servrar.
- `.claude/settings.local.json` = projektspecifika behörigheter (eslint, tsc, supabase CLI).
- Aktiverade plugins: `supabase`, `cloudflare`, `frontend-design`, `code-simplifier`, `anti-slop`, `hookify`, `remember`, `chrome-devtools-mcp`, `typescript-lsp`, `claude-md-management`, `claude-security`, `security-guidance`, `mattpocock-skills`, `superpowers`, `playwright`.
- Använd `Skill` innan större uppgifter — se `.claude/skills/`.

## Automation (Hooks)
- Kör `npx tsc --noEmit` och `npm run lint` före commit.
- Validera Supabase-migreringar (tidsstämpel, idempotens, RLS) innan push.
- Isolerade ändringar i `.claude/worktrees/`.
- **Worktrees: Ingen worktree ska användas.** Utför alla ändringar direkt i huvudcheckout (`main`), aldrig i `.claude/worktrees/`. Isolering görs genom git-stash eller temporära filer, aldrig genom worktree.

## Projektstruktur (Kort)
- TanStack Start + React + Supabase. Netlify deployment. Se `docs/adr/`, `docs/agents/`.

## Säkerhet & Kvalitet
- Inga fake implementationer. Defensiv programmering (null-guards, loading/error). UUID-validering — aldrig mock-ID (`"demo-store-1"`). RLS på alla affärstabeller. Migrationer: unika tidsstämplar, `IF NOT EXISTS`, `DROP POLICY IF EXISTS`. Endast `@supabase/supabase-js`. Inga service-role-nycklar i klientkod.

## Domänregler
- Leveransimport: matcha `sap_article_id` (Mat-nr), fallback `bnr`. Aldrig SKU.
- Planogram: matcha `bnr`, uppdatera `ean`.
- `product_shelf_life` global. `store_product_deliveries` butiksspecifikt — skriv aldrig över historik.

## Utvecklingsflöde
1. Undersök befintlig kod (`docs/`, `.claude/skills/`, typer) innan ny kod.
2. Återanvänd komponenter/verktyg — inga dubbletter.
3. Följ TanStack Starts data-loading; undvik duplicerad hämtning.
4. Efter ändringar: kör tester, typkontroll, bygg.

## Verifiering
- `npm run build` + `npx supabase gen types typescript` efter schemaändringar.
- Kontrollera RLS och index vid databasändringar.
