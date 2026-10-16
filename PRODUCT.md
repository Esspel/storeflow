# StoreFlow — Produktkontext

## Plattform
- Web (TanStack Start + Vite + React + TypeScript)
- Supabase (postgres, RLS, Edge Functions)
- Cloudflare (proxy-kompatibel cookie-baserad butik — IP-matchning borttagen pga Cloudflare-proxy, se `quick-login.tsx`)

## Produkt
- Butiksregister (store register, leverans, avvikelser, planogram)
- Quick-login (`/quick-login`): cookie-baserad butiksväljare + användarväljare + PIN
- Användare: `app_users`, `user_stores`, `stores`
- Leverans: matcha `sap_article_id` / `bnr`, aldrig SKU; EAN-uppdatering på planogram

## Design (från kod)
- Coop-färger (`coop-gron-600`, `coop-gray-100`), Tailwind + CSS variabler (`src/styles.css`)
- Operate-läge (uppgiftsorienterat, inte marknadsföring)
- Ingen `DESIGN.md` — dokumenteras vid behov via `/impeccable document`

## Regler
- Svenska (svenska IT-termer) för svar / commits
- Ingen worktree (alla ändringar direkt i `main`)
- Defensiv programmering, UUID-validering, RLS på affärstabeller
