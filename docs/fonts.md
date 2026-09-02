# Coop Typsnitt i StoreFlow

## Installation

1. **Ladda upp typsnittsfiler** till Supabase Storage bucketen `fonts`:
   - `CoopSans-Regular.woff2`
   - `CoopSans-Medium.woff2`
   - `CoopSans-Bold.woff2`
   - `CoopSans-Black.woff2`
   - `CoopSansPrice-Black.woff2`
   - `CoopMarker-Regular.woff2`
   - `CoopMarker-Bold.woff2`

2. **Gör bucketen publik**:
   - Supabase Dashboard → Storage → `fonts` → Settings → Make Public

3. **Initiering**: `initializeFonts()` anropas automatiskt i `__root.tsx`

## Användning

### CSS-klasser

| Klass | Vikt | Användning |
|-------|------|------------|
| `coop-font-display` | 900 | Stora rubriker |
| `coop-font-heading` | 700 | Mellanstora rubriker |
| `coop-font-heading-sm` | 700 | Små rubriker |
| `coop-font-emphasis` | 500 | Ingresser & betoning |
| `coop-font-body` | 400 | Brödtext |
| `coop-font-price-num` | 900 | Prissättning (tabular-nums) |
| `coop-font-price-num-sm` | 900 | Mindre priser (tabular-nums) |
| `coop-font-price-num-lg` | 900 | Stora priser/erbjudanden (tabular-nums) |
| `coop-font-marker` | 400 | Handgjord komplement |
| `coop-font-marker-strong` | 700 | Stark handgjord betoning |

### React-komponent

```tsx
import { Typography } from "@/components/typography";

<Typography variant="display" centered>Stor rubrik</Typography>
<Typography variant="price">99 kr</Typography>
<Typography variant="marker">Handgjord notering</Typography>
```

### Kolon-tecken och blandad text
**Viktigt:** `Coop Sans Price` är ett siffror-specifikt typsnitt och saknar många vanliga tecken. För att undvika felaktig återgivning (t.ex. ersättningstecken eller saknade specialtecken) används istället `Coop Sans` med `tabular-nums` för all text som blandar siffror med vanliga bokstäver, specialtecken (`%`, `kr`, `:`) eller andra icke-siffe-tecken.

`Typography`-komponenten mappar därför `price`/`price-sm`/`price-lg`-varianterna till `coop-font-body` (Coop Sans) med tabular nums för enhetlig sifferbredd.

Exempel:
```tsx
<Typography variant="price">99 kr</Typography>
// Renderas med Coop Sans + tabular-nums — siffror och text i samma typsnitt

<Typography variant="price">09:30</Typography> 
// Renderas med Coop Sans + tabular-nums — kolon fungerar korrekt
```

### Programmatisk API

```tsx
import { getTypographyClass, initializeFonts } from "@/lib/fonts";

initializeFonts();
const klass = getTypographyClass("heading");
```

## Justering (enligt manual)

- **Standard**: Vänsterställd (`text-left`) eller Centrerad (`text-center`)
- **Asymmetrisk layout** (undantag): `text-asymmetric` (t.ex. justify)

## Typsnittsregler

### Coop Sans
- **Black (900)**: Stora rubriker
- **Bold (700)**: Mellanstora/små rubriker
- **Medium (500)**: Ingresser & betoning
- **Regular (400)**: Brödtext

### Coop Sans Price
- **Black (900)**: Prissättning och erbjudanden
- Smalare, kraftigare siffror för synlighet
- `font-variant-numeric: tabular-nums` för enhetlig sifferbredd

### Coop Marker
- **Regular (400) & Bold (700)**: Handgjord komplement
- Använd ALDRIG som ersättning för Coop Sans
- Använd för att framhäva specifika ord eller kortare budskap
