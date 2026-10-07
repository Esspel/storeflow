# StoreFlow

Retail store management application (retail management / butikshantering) byggd med TanStack Start, React och Supabase. Körs nu i **Cloudflare Workers** istället för Netlify.

## Deployment — Cloudflare Workers

- **Plattform:** Cloudflare Workers (tidigare Netlify)
- **Build:** `npm run build` → `dist/`
- **Publicera:** Ladda upp till Cloudflare via `wrangler` eller CI/CD-pipeline
- **Domän:** Konfigureras i Cloudflare Dashboard / `wrangler.toml`
- **Miljövariabler:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` sätts i Workers-secrets

> Tidigare Netlify-konfiguration (`netlify.toml`) är ersatt av Cloudflare Workers. Säkerhetsrubriker (CSP, HSTS, etc.) flyttas till `wrangler.toml` / Pages-rules.

## Tekniska stack

- **Frontend:** TanStack Start · React 19 · TypeScript
- **Styling:** Tailwind CSS v4 · Radix UI · shadcn/ui-komponenter
- **Router:** TanStack Router
- **Data:** TanStack Query · Supabase JS SDK (`@supabase/supabase-js`)
- **Backend:** Cloudflare Workers (edge-deployment)
- **Databas:** Supabase Postgres (RLS aktiverat på alla tabeller)
- **Autentisering:** Egen auth via `auth-context.tsx` + Supabase Auth
- **Säkerhet:** RLS-policies, SECURITY DEFINER-funktioner, exponerar aldrig service-role-nycklar till klient

## Funktioner och moduler

### Routes (`src/routes/`)

| Route | Funktion |
|---|---|
| `__root.tsx` | Rot-layout, app-shell, global navigation |
| `index.tsx` | Startsida / Dashboard |
| `login.tsx` | Inloggning (autentisering) |
| `ersattningcheck.tsx` | Ersättningskontroll — artikelmatchning mot SAP (`sap_article_id`, `bnr`), import av leveransnoter |
| `avvikelser.tsx` | Avvikelser / avvikelseregister |
| `belastning.tsx` | Belastningsstatistik och periodval |
| `butiksregister.tsx` | Butiksregister / store register |
| `kundonskemal.tsx` | Kundönskemål / customer requests |
| `kundrunda.tsx` | Kundrunda / customer rounds |
| `rapporter.tsx` | Rapporter och statistik |
| `schema.tsx` | Schema / planeringsvy |
| `uppgifter.tsx` | Uppgifter / tasks |
| `personal.tsx` | Personalhantering |
| `gdpr.tsx` | GDPR-export och datahantering |
| `anvandningsvillkor.tsx` | Användningsvillkor |
| `integritetspolicy.tsx` | Integritetspolicy |
| `licens.tsx` | Licensinformation |
| `installningar.tsx` | Inställningar |
| `testpanel.tsx` | Testpanel / utvecklingsverktyg |

### Lib (`src/lib/`) — kärnlogik

| Modul | Funktion |
|---|---|
| `auth.ts` | Autentiseringslogik (login, session, token) |
| `auth-context.tsx` | React-context för auth-tillstånd |
| `supabase.ts` | Supabase-klientkonfiguration |
| `sap-proxy.ts` | SAP-proxy för artikeldata — retry-logik (`retryFetchViaProxy`), väntar på Chrome Extension, normaliserar runtime-fel |
| `barcode-context.tsx` | Streckkodsavläsning (Zxing, jsQR) |
| `csv.ts` | CSV-export/import — BOM + semikolon + quote-escape + formulainjektionsskydd |
| `excel-parser.ts` | Excel-datum och parsning |
| `excel-date.ts` | Datumkonvertering för Excel |
| `shelfLife.ts` | Hållbarhet / shelf-life-beräkningar (`product_shelf_life`) |
| `products.ts` | Produktdata och katalog |
| `coop-products.ts` | COOP-produktmatchning |
| `productCatalogRisk.ts` | Riskanalys för produktkatalog |
| `query-config.ts` | TanStack Query-konfiguration |
| `offline-queue.ts` | Offline-kö för synkronisering |
| `secure-storage.ts` | Säker lagring av känslig data |
| `error-capture.ts` | Felhantering och loggning |
| `error-page.ts` | Fel-sida / error boundary |
| `font.ts` | Typografi och font-nyttjande |
| `haptic.ts` | Haptisk feedback |
| `task-utils.ts` | Uppgiftsverktyg |
| `text-utils.ts` | Textbearbetning |
| `swedish-holidays.ts` | Svenska helgdagar |
| `time-simulation.ts` | Tidssimulering / testverktyg |
| `utils.ts` | Allmänna Hjälpfunktioner |
| `guard-no-rest.ts` | Skydd mot REST-anrop (kontrollerar att endast Supabase SDK används) |

### Komponenter (`src/components/`)

- `app-shell.tsx` / `app-sidebar.tsx` — huvudlayout
- `barcode-scan-button.tsx` / `camera-scanner.tsx` — streckkodsavläsning
- `global-store-selector.tsx` — butiksval
- `import-dialog.tsx` / `xml-import-modal.tsx` — importdialoger
- `qr-display.tsx` / `qr-kundonskemal-form.tsx` — QR-koder
- `lock-screen.tsx` / `keyboard-shortcuts.tsx` — säkerhetslås och snabbkommandon
- `gdpr-export.tsx` / `gdpr-image-reminder.tsx` — GDPR-funktioner
- `photo-viewer.tsx` — bildvisning
- `skeleton-card.tsx` / `empty-state.tsx` / `error-boundary.tsx` — UI-tillstånd
- `first-time-setup.tsx` — första gången-setup
- `push-notification-setup.tsx` — push-notiser
- `copyable-id.tsx` / `masked-field.tsx` — formulärkomponenter

### Hooks (`src/hooks/`)

- `use-barcode-scanner.ts` — streckkodsskanning
- `use-mobile.tsx` — mobilenhetsdetektering
- `use-push-notifications.ts` — push-notiser

## Data och affärsregler

- **Artikelmatchning:** Primär match på `sap_article_id` (Mat-nr), fallback på `bnr`. Aldrig SKU.
- **Planogram:** Match på `bnr`, uppdatera `ean`.
- **Produktmaster vs butikhistorik:** `product_shelf_life` är global (`shelf_lifetime_days`). Bästa-före, ankomstdatum och kvantiteter är butikspecifika per leverans (`store_product_deliveries`). Överskriv aldrig befintlig leveranshistorik vid upsert.
- **RLS:** Aktiverat på alla tabeller med business data; `anon` och `authenticated` beaktas explicit.
- **Säkerhet:** Direkt Supabase SDK endast; aldrig anpassade REST-`fetch()`; UUID valideras vid gränser; ingen mock-ID (`"demo-store-1"`).

## Kommandon

```bash
# Utveckling
npm run dev

# Bygg (för Cloudflare Workers)
npm run build

# Lint
npm run lint

# Type-check / kontroll av REST-anrop
npm run check:no-rest

# Databas-push (Supabase)
npx supabase db push

# Generera typer
npx supabase gen types typescript
```

## Migrationer och schema

- Migrations i `supabase/migrations/` — unika tidsstämplar (`YYYYMMDDHHMMSS`)
- `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
- `DROP POLICY IF EXISTS` före `CREATE POLICY`
- `DO $$ BEGIN IF NOT EXISTS ... END IF; END $$;` för kolumner
- Aldrig modifiera redan applicerad migration; skapa ny istället

---
*Projektinstruktioner (CLAUDE.md) och domän-dokumentation (CONTEXT.md) finns i repo-root.*
