# StoreFlow

Butikshanteringsplattform byggd med React, Supabase och Tailwind CSS. Mobiloptimerad PWA för daglig användning av butikspersonal och chefer.

## Stack

| Lager | Teknik |
|---|---|
| Frontend | React 19, TanStack Router, Tailwind CSS v4 |
| Backend | Supabase (PostgreSQL, RLS, Realtime, Storage) |
| Serverlogik | Supabase Edge Functions (Deno) |
| Bygg | Vite 7 |
| Deploy | Netlify |

## Moduler

| Modul | Sida | Beskrivning |
|---|---|---|
| Översikt | `/` | Daglig hub med uppgiftsstatus och notiser |
| Uppgifter | `/uppgifter` | Uppgifter med checklistor, bilder, frågor och återkommande scheman |
| Schema | `/schema` | Personalscheman med CSV-import från Quinyx/SAP |
| Avvikelser | `/avvikelser` | Rapportera och följa upp avvikelser med SLA-spårning |
| Kundrunda | `/kundrunda` | Strukturerad butiksinspektion med checkpoints och avvikelseloggning |
| Möten | `/moten` | Mötesplanering med agenda, beslut och uppgiftsgenerering |
| Kundönskemål | `/kundonskemal` | Hantera och svara på kundönskemål med artikelnummerlänk till Mitt Coop |
| Rapporter | `/rapporter` | BI-dashboard för chefer med KPI och regionala jämförelser |
| Mallar | `/mallar` | Återanvändbara uppgiftsmallar för butik, förening och HK |
| Personal | `/personal` | Hantera konton, roller, PIN-koder och streckkoder |
| Butiksregister | `/butiksregister` | Administrera butiker, föreningar, distrikt och regioner |
| Inställningar | `/installningar` | Profil, pushnotiser, GDPR-export |

## Kom igång

### Krav

- Node.js 20+
- Ett Supabase-projekt

### Installation

```bash
npm install
cp .env.example .env
# Fyll i VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY i .env
```

### Miljövariabler

```
VITE_SUPABASE_URL=https://<projekt>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-nyckel>
VITE_VAPID_PUBLIC_KEY=<vapid-publik-nyckel>   # Valfritt, för pushnotiser
```

### Databas

Kör migreringarna i `supabase/migrations/` i kronologisk ordning mot ditt Supabase-projekt.

### Utveckling

```bash
npm run dev
```

### Produktion

```bash
npm run build
```

## Arkitektur

### Autentisering

Anpassad sessionsmodell utan Supabase Auth. Lösenord hashas med bcrypt via `pgcrypto`. Sessioner lagras i `app_sessions` (7 dagars livslängd) och skickas som `x-session-token`-header. RLS-funktionen `app_current_user_id()` identifierar den inloggade användaren.

**Snabbyte av användare:** Stöder PIN-kod och streckkod (Zebra TC52 hårdvaruscanner eller kamerascanning) via `LockScreen`-komponenten och Edge Function `quick-switch`.

### Hierarki och roller

```
admin → hk → forening → distrikt → chef (manager) → anvandare (employee)
```

RLS-policyer är kopplade till hierarkinivå och butikstillhörighet. Ingen användare kan se data utanför sina tilldelade butiker.

### Återkommande uppgifter

Föräldrauppgifter med `recurrence_rule` (daily/weekly/monthly/yearly) genererar barninstanser via `spawnRecurringTasks()` i klienten. Avsiktligt raderade instanser spåras i `deleted_periods[]` på föräldern. "Radera alla framtida" sätter `recurrence_end`.

### Streckkodsskanning

Zebra TC52 stöds via `use-barcode-scanner.ts` (tangentbordsburst-igenkänning). Kameraskanning fungerar via `CameraScanner`-komponenten med inbyggd `BarcodeDetector`-API.

**Format som stöds:** EAN-13, EAN-8, QR, Data Matrix, Code 128, Code 39, Code 93, Aztec, PDF417, Codabar, ITF, UPC-A, UPC-E.

### Offline-first

Service worker cachar appskal. Ändringar sparas i `localStorage` vid nätverksavbrott och synkroniseras vid återanslutning.

### Realtime

Supabase Realtime WebSocket-prenumerationer håller uppgiftstavlan och notiser uppdaterade utan polling.

## Projektstruktur

```
src/
  routes/          # Sidkomponenter (TanStack Router filbaserad routing)
  components/      # Delade UI-komponenter
    ui/            # shadcn/ui-bibliotek
  hooks/           # Custom React hooks
  lib/             # Supabase-klient, auth, utilities
supabase/
  migrations/      # SQL-migreringar i kronologisk ordning
  functions/       # Edge Functions (secure-login, quick-switch, send-push)
public/
  sw.js            # Service worker
  manifest.json    # PWA-manifest
```

## Skript

| Kommando | Beskrivning |
|---|---|
| `npm run dev` | Starta dev-server med HMR |
| `npm run build` | Produktionsbygge |
| `npm run preview` | Förhandsgranska produktionsbygge lokalt |
| `npm run lint` | Kör ESLint |
| `npm run format` | Formatera kod med Prettier |

## Säkerhet

- Exponera aldrig `SUPABASE_SERVICE_ROLE_KEY` i klientkod
- Alla tabeller har RLS aktiverat
- Direkt tabellåtkomst utan giltig session returnerar inga rader
- VAPID-privata nycklar lagras enbart som Edge Function-hemligheter
- Byt ut standardlösenord i seed-data innan produktionsdrift
