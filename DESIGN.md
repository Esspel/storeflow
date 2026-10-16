# StoreFlow — Designsystem (dokumenterat från kod)

## Visuellt läge
- **Operate** — uppgiftsorienterat, scanbarhet och konsekvens före uttryck
- Inget gradient-text, inget eyebrow, inga sektionsnummer, inga hårda offset-skuggor (craft-floor-bans upprätthållna)
- Endast web (TanStack Start + React + Tailwind), ingen native-anpassning

## Färgpalett (från `src/styles.css`)
```css
--coop-gron-600: #008A14        /* Primär CTA, focus-ring, selection */
--coop-gray-100: #FBF8F4        /* Bakgrund, input-bakgrund, kort */
--coop-gray-50: #FBF8F4         /* Hover/disabled bakgrund */
--coop-gray-300: #E0DAD5        /* Border, divider */
--coop-gray-900: #38332E        /* Primär text */
--coop-morkgron: #003D09        /* Selection text */
--coop-gron-200: #CCE8D0        /* Selection bakgrund */
```

## Typografi
- Tailwind-standard (system font stack)
- Input: `text-base` (16px) — uppfyller iOS-zoom-krav
- Rubriker: `text-xl` / `text-lg` + `font-semibold`
- UI-text: `text-sm` / `text-base`

## Avstånd & ritmik
- Container: `px-6 py-12` centrerad `min-h-screen`
- Komponent-cell: `h-14` (56px) — touch-target ≥ 44px
- Mellan fält: `mt-2` (8px) label→input, `space-y-4` mellan grupper
- Kort-radius: `rounded-2xl` (16px), `rounded-xl` (12px)

## Komponenter
| Komponent | Användning | State-varianter |
|-----------|------------|-----------------|
| `Button` (shadcn) | Primär CTA (Logga in), sekundär (Avbryt) | `focus-visible:ring-2 ring-coop-gron-500`, `disabled:opacity-50`, `active:scale-95` |
| `Label` (shadcn) | Fältetiketter | `text-sm font-medium text-coop-gray-900` |
| `<select>` (native) | Butik / användare | `focus-visible:ring-2 ring-coop-gron-500 transition-colors` |
| PIN-dots | 4-ställning kod | `h-14 w-14` celler, `transition-all`, `active:scale-95` |
| `Store` / `ArrowRight` (lucide) | Ikoner | `w-5 h-5` / `w-4 h-4` |

## Interaktion & motion
- **Focus-ring**: `focus-visible` (inte `focus`) — ren tangentbordsnavigation
- **Transition**: `transition-colors` på select; `transition-all` på PIN-cell
- **Active press**: `active:scale-95` på knappar/celler
- **Selection**: `selection:bg-coop-gron-200 selection:text-coop-morkgron` (global)

## Responsivitet
- Mobil-first: `px-6` i alla storlekar
- `min-h-screen` + `flex flex-col items-center justify-center` — alltid centrerad
- Ingen media-query krävs (fluid container)

## Accessibility
- `role="button"` + `tabIndex={0}` på PIN-celler
- `aria-label` på varje siffra (`PIN siffra 1…4`)
- `aria-invalid` + `aria-describedby` på fel
- 16px input-text (iOS zoom-safe)
- `touch-action: manipulation` globalt

## Ytöversikt (routes med UI)
| Route | Typ | Design-anmärkning |
|-------|-----|-------------------|
| `/quick-login` | Operate | Polerad (selection + focus-visible + transition) |
| `/login` | Operate | Inomräknad, ej granskad |
| `/` (index) | Operate | Dashboard-skal (`app-shell`) |
| `/avvikelser` `/belastning` `/rapporter` | Operate | Tabell/Lista-mönster |
| `/installningar` | Operate | Form-sektioner |
| `/personal` `/kundrunda` `/schema` | Operate | Kalender/rutt-baserade |
| `lock-screen.tsx` | Operate | Skärm-lås (hidden input, undantag från design-revision) |

## Öppna frågor (inte blockerande)
- Ingen `DESIGN.md` tidigare — detta är första versionen
- Inga brand-assets (logga, foto) — endast lucide + palette
- Dark mode avstängt (`/* dark mode disabled - Coop colors fixed */`)
- `Progress` importeras men ej används i `quick-login.tsx` (linter-varning)

## Version
- Skapad: 2026-10-15 via `/impeccable document` (launcher blockad, `document.md` följdes)
- Gäller för: `main`-checkout, alla routes ovan