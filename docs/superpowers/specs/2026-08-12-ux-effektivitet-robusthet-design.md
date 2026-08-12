# StoreFlow: UX-förbättringar för effektivitet och robusthet

**Datum:** 2026-08-12
**Status:** Godkänd design (väntar på spec-granskning)
**Mål:** Göra StoreFlow snabbare i vardagen och mer tålig mot nätverksfel — utan att fylla databasen med loggar.

## Constraint (från användardialog)

- Ingen auditlogg / transaktionslogg i databasen (undantag: `support_tickets` för supportflöde).
- Ingen "smart prefill" eller tangentbordsgenvägar (avvisat).
- Kundrunda är en **delad runtur**, inte personligt kopplad.
- Bildkomprimering och visningsläge för kundrunda finns redan — implementeras ej.
- Offline-kö, diagnostik och felinfo ska vara **klientsidiga** (localStorage / minnet) där det inte krävs serversynk.
- Pull-to-refresh och "duplicera ärende" i avvikelser — utelämnas.

## Omfattning

### A. Snabbare startsida per roll (0 ny infrastruktur)
- **Personal:** "Mina öppna uppgifter" + "Skapa avvikelse" + snabblänk till dagens kundrunda (om en är tilldelad denna vecka).
- **Chef/Admin:** "Öppna avvikelser i min butik" + "Schema idag" + "Belastning" + "Personal" + "Tilldela kundrunda" (veckovis).
- Implementation: `useAuth()` roll + `activeStore`, enkel query per sektion. Ingen ny state.

### B. Offline-kö i header (synlig, inte i DB)
- Alla `POST/PATCH/DELETE` mot Supabase går via wrapper `mutateWithQueue(fn)`.
- Nätverksfel → lägg i `localStorage["sf-offline-queue"]` (array `{fn, args, timestamp, retryCount}`).
- Header-badge `"N väntar på synk"` med `aria-live="polite"`.
- Vid nätverksåterkomst: `navigator.onLine` + exponential backoff retry, max 3 försök, sedan toast "Kunde inte synkas — öppna appen igen".
- Ingen DB-tabell, ingen auditlogg — lokal kö som töms vid lyckad synk.

### C. Ångra/redo i formulär (5 s)
- Efter lyckat `mutateWithQueue` → toast "Sparat – Ångra" (knapp).
- "Ångra" anropar samma endpoint med DELETE eller PATCH till föregående tillstånd (behåller `previousData` i React Query cache).
- Efter 5 s → toast försvinner, `previousData` rensas.
- Endast i formulär som skapar/uppdaterar (avvikelse, uppgift, kundrunda-checkpoint). Inga list-vyer.

### D. Inline-validering + blockerande submit (WCAG 3.3.1)
- Alla `react-hook-form` får `mode: "onChange"` + `aria-describedby` på felmeddelande.
- Submit-knapp `disabled` tills `formState.isValid === true`.
- Feltext: kort, specifikt, svensk ("Fältet får inte vara tomt", "Ange giltigt datum").
- Inga toast-fel för validering — bara inline.

### E. Felgränser per widget (React Error Boundary)
- Wrappa varje kort på startsida (`QuickCard`, `StatCard`, kundrunda-kort, uppgifter-lista) i `<ErrorBoundary fallback={<WidgetFallback />}>`.
- `WidgetFallback` visar: "Kunde inte ladda [namn] – försök igen" + knapp "Uppdatera" som `queryClient.invalidateQueries({queryKey})`.
- En krasch i kundrunda stoppar inte avvikelser-listan.

### F. Diagnostik-knapp + supportflöde (bygger på befintlig sektion i installningar.tsx)
- Diagnostik-sektionen i `installningar.tsx` döljs bakom klick på versionsnummer (finns redan) — lägg till:
  - **Knapp "Skicka till support"** (alla roller): samlar diag-data (se nedan) + skapar rad i ny DB-tabell `support_tickets`.
  - Innehåll: `userAgent`, `app_version`, `offline_queue_length`, `last_error`, `diag_idb_usage`, `user_id`, `store_id`, `created_at`, och valfritt fritext-meddelande från användare.
- **Ny admin-sida `/support`**: listar alla `support_tickets` (per butik om chef, alla om admin).
  - Visar: datum, användare, butik, feltext, status (`öppen`/`stängd`).
  - Admin kan: läsa detalj, byta status, svara (fritext-kommentar i `support_ticket_replies`).
  - Supporten sker här — ingen mejl.
- **Nya tabeller** (endast detta flöde):
  - `support_tickets`: `id, user_id, store_id, app_version, user_agent, offline_queue_length, last_error, idb_usage, message, status, created_at, resolved_at`.
  - `support_ticket_replies`: `id, ticket_id, admin_id, message, created_at`.

### G. Progressiv laddning + skeletons (utan ny lib)
- Ersätt `isLoading` spinner i listor (`uppgifter`, `avvikelser`, `kundrunda`, `mallar`) mot skeleton-rader (befintliga `Skeleton` från `ui/skeleton.tsx`).
- `react-query` `placeholderData: keepPreviousData` vid paginering/sort → inga flimmer.
- `Suspense` boundary runt hela route-komponent (finns i `__root.tsx` via `ErrorComponent`) — behåller nuvarande fallback.

### H. Auto-spara utkast till localStorage
- Långa formulär (avvikelse med bilder, kundrunda-checkpoint) försvinner vid misstänkt reload/tab-close.
- `useEffect` debounced (1.5 s) sparar `form.getValues()` till `localStorage["sf-draft-<route>-<id>"]`.
- Vid mount: om utkast finns → toast "Återställ utkast?" med knappar.
- Rensas vid lyckat submit.

### I. Visuell "senast synkad" indikator
- Liten klocka + tidstämpel i header/footer: "Synkad 14:23".
- Uppdateras vid varje lyckad `queryClient.invalidateQueries()` + mutate.
- Röd om > 10 min gammal.

### J. Handlingsbara tomma tillstånd
- Ersätt `EmptyState` med: ikon + en mening + primärknapp ("Skapa uppgift", "Starta kundrunda", "Logga avvikelse") som navigerar rätt.
- Använd befintliga `PageHeader` + `Button`.

### K. Snabbfilter "Mina / Alla / Öppna" som chips
- Överst i listor (`avvikelser`, `uppgifter`, `kundrunda-sessioner`): 3 chips `Mina | Öppna | Alla` med `aria-pressed`.
- Sparar val i `localStorage` per route.

### L. Felmeddelanden på svenska (inte tekniska)
- Central `errorToSwedish(err)` i `supabase.ts`: mappar kända koder →
  - "Inloggning utgången – logga in igen"
  - "Ingen internetuppkoppling – sparas offline"
  - "Servern svarar inte – försök om en minut"
- Alla `toast.error` använder denna.

### M. Kopiera felsökande info till urklipp
- I `installningar.tsx` (alla roller): knapp "Kopiera felinfo" → samlar `userAgent`, `appVersion`, `lastError`, `offlineQueueLength` → `navigator.clipboard.writeText()` → toast "Kopierat — klistra in i mail till support".
- Ingen fil, ingen DB.

### N. Veckovis kundrunda-tilldelning (admin/chef)
- **Ny komponent i `/kundrunda` eller egen route `/kundrunda-schema`:**
  - Admin/chef ser en veckovy (måndag–söndag) med en dropdown per dag: "Vem gör kundrundan?"
  - Listar butikspersonal (`app_users` med `store_id = activeStore.id`).
  - Sparar till ny tabell `kundrunda_assignments`: `id, store_id, week_start (date), day_of_week (0-6), assigned_user_id, created_by, created_at`.
  - En användare kan bara tilldelas en gång per dag.
- **På startsidan (personal):** om `kundrunda_assignments` för denna vecka innehåller `assigned_user_id = user.id` → visa "Din kundrunda: [dag]" som snabblänk.
- **På kundrunda-sidan:** lista "Mina tilldelningar denna vecka" överst, med knapp "Starta runda".
- Ingen ändring av själva rundan (checkpoints/zoner) — bara vem som ska göra den.

### O. Guldklimpar (låg kostnad, högt värde)
| Idé | Kodändring |
|---|---|
| Enter = spara i formulär | `onKeyDown={e => e.key==="Enter" && !e.shiftKey && handleSubmit()}` på `Textarea`/`Input`. |
| Fokus första felfält vid submit-fel | `formState.errors` → `document.getElementById(firstErrorId)?.focus()`. |
| Behåll scroll-position vid paginering | `queryClient.setQueryDefaults({placeholderData: keepPreviousData})` + `scrollRestoration: "manual"` i route. |

## Utelämnade (per feedback)
- Smart prefill / tangentbordsgenvägar
- Personlig kundrunda (det är delad runtur)
- Auditlogg / transaktionslogg i DB (undantag: support_tickets)
- Konfliktmerge vid synk
- Batch-åtgärder (markera flera)
- Bildkomprimering (finns redan)
- Visningsläge för kundrunda (finns redan)
- Pull-to-refresh på mobil
- Duplicera ärende i avvikelser
- "Min nästa kundrunda" per automatik (ersatt av veckovis tilldelning)

## Ny databas (endast supportflöde + kundrunda-tilldelning)
```sql
-- Supportärenden (ersätter mejl)
CREATE TABLE support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_users(id),
  store_id uuid,
  app_version text,
  user_agent text,
  offline_queue_length int,
  last_error text,
  idb_usage text,
  message text,
  status text DEFAULT 'open',
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE support_ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES support_tickets(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES app_users(id),
  message text,
  created_at timestamptz DEFAULT now()
);

-- Veckovis kundrunda-tilldelning
CREATE TABLE kundrunda_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  week_start date,
  day_of_week int CHECK (day_of_week BETWEEN 0 AND 6),
  assigned_user_id uuid REFERENCES app_users(id),
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (store_id, week_start, day_of_week)
);
```

## Filändringar (grovt)
| Fil | Ändring |
|---|---|
| `src/routes/index.tsx` | Startsida per roll + skeleton-kort + snabblänk tilldelad kundrunda |
| `src/lib/supabase.ts` | Ny `mutateWithQueue(fn)` wrapper + offline-kö logic + `errorToSwedish(err)` + typer för `support_tickets`, `kundrunda_assignments` |
| `src/components/app-shell.tsx` | Header-badge för offline-kö (`aria-live`) + "senast synkad"-indikator |
| `src/routes/avvikelser.tsx`, `uppgifter.tsx`, `kundrunda.tsx`, `mallar.tsx` | Inline-validering, disabled submit, `Skeleton` rader, `ErrorBoundary` per widget, snabbfilter, auto-spara utkast |
| `src/components/ui/form.tsx` | `mode: "onChange"` default, `aria-describedby` helper, Enter-spara, fokus-första-fel |
| `src/routes/installningar.tsx` | Bygg vidare på diagnostik-sektion: "Skicka till support"-knapp + "Kopiera felinfo" (alla roller) |
| `src/routes/support.tsx` (ny) | Admin-sida: lista + detalj + status + svar |
| `src/routes/kundrunda.tsx` (eller ny `/kundrunda-schema`) | Veckovis tilldelning av kundrunda-ansvarig |
| `src/lib/error-capture.ts` (ny) | Ringbuffer för `console.error` + `unhandledrejection` |
| `supabase/migrations/*.sql` (ny) | Tabeller för `support_tickets`, `support_ticket_replies`, `kundrunda_assignments` |

## Testkrav (definition of done)
1. **Offline:** Stäng nätverk → skapa avvikelse → badge "1 väntar" → öppna nätverk → badge försvinner, avvikelse syns i lista.
2. **Ångra:** Spara avvikelse → toast "Sparat – Ångra" → klicka Ångra inom 5 s → avvikelse försvinner, toast "Ångrat".
3. **Validering:** Tomt obligatoriskt fält → inline feltext, submit-knapp disabled → fyll i → knapp enabled.
4. **Felgräns:** Krascha en widget → övriga kort fungerar, fallback visas.
5. **Diagnostik:** Klicka versionsnummer → diagnostik-sektion visas → "Skicka till support" skapar rad i `support_tickets`, syns på `/support`.
6. **Support-sida:** Admin öppnar `/support` → ser ärenden → byter status → svarar → användare ser svar (om UI för det byggs).
7. **Auto-spara utkast:** Fyll formulär → ladda om sida → toast "Återställ utkast?" → klicka → fält ifyllda.
8. **Senast synkad:** Vänta 10 min → indikator röd.
9. **Tomma tillstånd:** Radera alla uppgifter → "Skapa uppgift"-knapp syns.
10. **Snabbfilter:** Klicka "Mina" → lista filtreras, val sparas vid reload.
11. **Svenska fel:** Koppla från nätverk → skapa → toast "Ingen internet..." istället för "Failed to fetch".
12. **Kopiera felinfo:** Klicka "Kopiera felinfo" → urklipp innehåller rätt data → toast "Kopierat".
13. **Kundrunda-tilldelning:** Admin väljer "Anna" för måndag v42 → sparas → Anna ser "Din kundrunda: Måndag" på startsidan → klickar → startar runda.
14. **Guldklimpar:** Enter sparar, fokus går till första felfält, scroll-position bibehålls vid paginering.
