import { createFileRoute, Link } from "@tanstack/react-router";
import {
  TriangleAlert as AlertTriangle, ChartBar as BarChart2, CalendarDays,
  CircleCheck as CheckCircle2, ChevronRight, ClipboardList,
  LayoutDashboard, ListChecks,
  Package,
  QrCode, Settings, ShoppingCart, Tv as Tv2, UserRound, Users,
  Terminal,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/hjalp")({
  component: HjalpPage,
});

type Feature = {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  path?: string;
  steps?: string[];
  tip?: string;
  /** Who sees this: "all" | "manager" | "employee" */
  access?: "all" | "manager" | "employee";
};

const FEATURES: { section: string; access?: "all" | "manager"; items: Feature[] }[] = [
  {
    section: "Dagligt arbete",
    access: "all",
    items: [
      {
        title: "Dashboard",
        description: "Översikt över dagens uppgifter, sena uppgifter och öppna avvikelser.",
        icon: LayoutDashboard,
        path: "/",
        access: "all",
      },
      {
        title: "Uppgifter",
        description: "Skapa, tilldela och slutför uppgifter. Stöd för återkommande uppgifter, checklistor med foton och multi-tilldelning.",
        icon: ListChecks,
        path: "/uppgifter",
        access: "all",
        steps: [
          "Svep höger på en uppgift (mobil) för att markera den som klar",
          "Svep vänster för att öppna detaljvyn",
          "Sök och filtrera på kategori, prioritet och sortering i alla flikar utom Idag",
          "Tryck länge för att se uppgiftens steg och frågor",
        ],
      },
      {
        title: "Schema",
        description: "Importera personalschema via XML från SoftOne GO. Visa skift per dag och medarbetare.",
        icon: CalendarDays,
        path: "/schema",
        access: "all",
        steps: [
          "Importera XML-fil via knappen i övre högra hörnet",
          "Välj vecka med pilarna",
          "Lånade skift visas med särskild markering",
        ],
      },
      {
        title: "Avvikelser",
        description: "Rapportera och följ upp avvikelser. Kategorier, prioriteter, bilder och kommentarer.",
        icon: AlertTriangle,
        path: "/avvikelser",
        access: "all",
        steps: [
          "Tryck 'Ny avvikelse' eller QR-ikonen (mobil: liten cirkelknapp till vänster om plus-knappen)",
          "Välj vanlig avvikelse för snabbval av ofta förekommande problem",
          "Exportera alla avvikelser som CSV via 'Exportera CSV'",
        ],
        tip: "QR-koder för avvikelser kan skannas av vem som helst utan inloggning — perfekt att sätta upp i butiken.",
      },
      {
        title: "Kundönskemål",
        description: "Håll koll på vad kunder önskar. Statusflöde från inkommit till uppfyllt.",
        icon: ShoppingCart,
        path: "/kundonskemal",
        access: "all",
        steps: [
          "Tryck QR-ikonen på ett önskemål för att få en länk att dela med kunden",
          "Kunden kan följa status (Inkommit → Beställd → Uppfylld) utan att logga in",
          "Kunder kan skicka in önskemål med bilder via QR-formuläret",
        ],
      },
      {
        title: "Kundrunda",
        description: "Genomför strukturerade butiksronder med checkpoints, zonpoäng och avvikelseregistrering.",
        icon: UserRound,
        path: "/kundrunda",
        access: "all",
      },
    ],
  },
  {
    section: "Chef & Admin",
    access: "manager",
    items: [
      {
        title: "Rapporter",
        description: "Statistik över uppgiftsefterlevnad, avvikelser och kundrundaresultat. CSV-export.",
        icon: BarChart2,
        path: "/rapporter",
        access: "manager",
      },
      {
        title: "Mallar",
        description: "Bygg checklistmallar som återanvänds för att skapa uppgifter. Sök, filtrera på kategori/prioritet och exportera i importbart CSV-format.",
        icon: ClipboardList,
        path: "/mallar",
        access: "manager",
        steps: [
          "Exportera mallar i CSV-format — exporterade filer kan importeras direkt (samma format)",
          "Sök bland mallar via sökfältet eller filtrera på kategori och prioritet",
          "HK kan skapa globala mallar som syns i alla butiker",
        ],
      },
      {
        title: "Personal & Roller",
        description: "Hantera medarbetare, roller, grupper och butiksåtkomst.",
        icon: Users,
        path: "/personal",
        access: "manager",
        steps: [
          "Skapa ny användare och tilldela butik",
          "Återställ PIN eller streckkod för en medarbetare",
          "Sök bland medarbetare vid grupptilldelning",
          "Administratörer kan skapa användare på alla hierarkinivåer",
        ],
      },
      {
        title: "Medarbetarbelastning",
        description: "Vy över hur många uppgifter varje medarbetare har tilldelade innevarande vecka.",
        icon: BarChart2,
        path: "/belastning",
        access: "manager",
        steps: [
          "Visar klar/pågår/sen/att-göra per person",
          "Staplar är relativa — den med flest uppgifter fyller hela bredden",
        ],
      },

    ],
  },
  {
    section: "Specialfunktioner",
    access: "all",
    items: [
      {
        title: "Pulstavla (TV-vy)",
        description: "En helskärmsvy för butiksmonitor/TV som visar dagens uppgifter och öppna avvikelser i realtid.",
        icon: Tv2,
        path: "/pulstavla",
        access: "all",
        steps: [
          "Chefer: Gå till Inställningar → Pulstavla PIN och sätt en 4-siffrig PIN",
          "Öppna /pulstavla på TV:n eller en dedikerad surfplatta",
          "Välj butik och ange PIN — vyn låses upp",
          "Uppdateras automatiskt var 30 sekund och via realtidsnotiser",
        ],
        tip: "PIN-koden skyddar mot att intern butiksinformation läcker ut på internet.",
      },
      {
        title: "QR-avvikelse",
        description: "Publik sida (ingen inloggning krävs) för snabbregistrering av avvikelse via QR-kod.",
        icon: QrCode,
        access: "manager",
        steps: [
          "Gå till Avvikelser → klicka 'QR-koder' (desktop) eller QR-ikonen (mobil)",
          "Ange avdelningsnamn, t.ex. 'Mejeri', och välj kategori",
          "Kopiera länken och generera QR via en extern QR-generator",
          "Sätt upp QR-koden i butiken — personal kan rapportera utan att logga in",
        ],
      },
      {
        title: "Kundönskemål QR-status",
        description: "Dela en statuslänk med kunden så de kan följa sitt önskemål utan inloggning.",
        icon: Package,
        access: "all",
        steps: [
          "Gå till Kundönskemål och tryck QR-ikonen på ett önskemål",
          "Kopiera länken och dela med kunden (SMS, e-post, utskrift)",
          "Länken visar en tidslinje: Inkommit → Beställd → Finns i butiken",
          "Länken är giltig i 30 dagar",
        ],
      },
      {
        title: "Snabbt användarbyte",
        description: "Byt användare på en delad enhet utan att logga ut och in.",
        icon: Users,
        access: "all",
        steps: [
          "Registrera din 4-siffriga PIN under Inställningar → Snabbt användarbyte",
          "Alternativt: scanna in ditt personliga streckkods-ID",
          "Tryck 'Växla användare' i profilmenyn (uppe till höger)",
          "Ange PIN eller skanna streckkoden för att byta session direkt",
        ],
      },
    ],
  },
  {
    section: "Inställningar",
    access: "all",
    items: [
      {
        title: "Inställningar",
        description: "Profilinformation, lösenordsbyte, PIN, streckkod, push-notiser och Pulstavla PIN.",
        icon: Settings,
        path: "/installningar",
        access: "all",
        steps: [
          "Ändra visningsnamn under 'Profil'",
          "Sätt din personliga 4-siffriga PIN under 'Snabbt användarbyte'",
          "Aktivera push-notiser för att få aviseringar direkt på enheten",
          "Chefer: sätt butikens Pulstavla-PIN längre ned på sidan",
          "Tryck på versionsnumret 7 gånger för att öppna diagnostikpanelen",
        ],
      },
    ],
  },
];

// Keyboard shortcuts — same as keyboard-shortcuts.tsx but displayed here for reference
const KEYBOARD_SHORTCUTS_ALL: never[] = [];

type CurlExample = {
  title: string;
  description: string;
  scope: string;
  command: string;
};

const CURL_EXAMPLES: CurlExample[] = [
  {
    title: "Lista uppgifter (storeflow-api)",
    description: "Hämta öppna uppgifter för en butik via REST-API:t.",
    scope: "tasks:read",
    command:
`curl -X GET \\
  "https://<project-ref>.supabase.co/functions/v1/storeflow-api/tasks?store_id=<store-uuid>&status=todo" \\
  -H "Authorization: Bearer sf_live_..."`,
  },
  {
    title: "Skapa avvikelse (storeflow-api)",
    description: "Rapportera en ny avvikelse programmatiskt.",
    scope: "deviations:write",
    command:
`curl -X POST \\
  "https://<project-ref>.supabase.co/functions/v1/storeflow-api/deviations" \\
  -H "Authorization: Bearer sf_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Trasig kylåpådsdörr",
    "store_id": "<store-uuid>",
    "category": "Utrustning",
    "priority": "Hög"
  }'`,
  },
  {
    title: "Importera leveransplan (CSV)",
    description: "Ladda upp en leveransplan för en given vecka, t.ex. från Power Automate.",
    scope: "deliveries:write",
    command:
`curl -X POST \\
  "https://<project-ref>.supabase.co/functions/v1/import-delivery-csv" \\
  -H "Authorization: Bearer sf_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "store_id": "<store-uuid>",
    "week_number": 33,
    "year": 2026,
    "csv": "måndag,08:00,söndag,20:00,Kolonial,Coop Logistik"
  }'`,
  },
  {
    title: "Importera schema (XML från SoftOne GO)",
    description: "Ladda upp ett personalschema. imported_by_user_id måste vara ett giltigt konto-id.",
    scope: "schedule:write",
    command:
`curl -X POST \\
  "https://<project-ref>.supabase.co/functions/v1/import-schedule-xml" \\
  -H "Authorization: Bearer sf_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "store_id": "<store-uuid>",
    "imported_by_user_id": "<app-user-uuid>",
    "xml_base64": "<base64-kodad XML-fil>"
  }'`,
  },
  {
    title: "Lista verktyg (mcp-server)",
    description: "MCP-servern följer JSON-RPC 2.0 och kan pekas ut direkt i en MCP-klient (t.ex. Claude, Antigravity CLI).",
    scope: "valfritt scope beroende på verktyg",
    command:
`curl -X POST \\
  "https://<project-ref>.supabase.co/functions/v1/mcp-server" \\
  -H "Authorization: Bearer sf_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  },
];

function FeatureCard({ item }: { item: Feature }) {
  const Icon = item.icon;
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-4.5 w-4.5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground">{item.title}</h3>
            {item.path && (
              <Link
                to={item.path}
                className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                {item.path}
                <ChevronRight className="h-2.5 w-2.5" />
              </Link>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{item.description}</p>
        </div>
      </div>

      {item.steps && item.steps.length > 0 && (
        <ol className="ml-12 mt-1 space-y-1.5">
          {item.steps.map((step, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground/80">
              <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                {i + 1}
              </span>
              <span className="leading-snug">{step}</span>
            </li>
          ))}
        </ol>
      )}

      {item.tip && (
        <div className="ml-12 mt-3 rounded-xl border border-info/20 bg-info/5 px-3 py-2">
          <p className="text-xs text-info leading-relaxed">
            <span className="font-semibold">Tips: </span>{item.tip}
          </p>
        </div>
      )}
    </div>
  );
}

function HjalpPage() {
  const { user } = useAuth();
  const isManager = user?.role === "manager" || user?.role === "admin";
  const isAdmin = user?.role === "admin";

  const visibleGroups = FEATURES.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.access === "manager") return isManager;
      return true;
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        title="Hjälp & Manual"
        description="Hur alla funktioner i StoreFlow fungerar."
      />

      <div className="space-y-10">
        {/* Feature sections */}
        {visibleGroups.map((group) => (
          <section key={group.section}>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {group.section}
            </h2>
            <div className="space-y-3">
              {group.items.map((item) => (
                <FeatureCard key={item.title} item={item} />
              ))}
            </div>
          </section>
        ))}

        {/* GDPR / dataportabilitet */}
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Dataportabilitet (GDPR)
          </h2>
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)] space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              StoreFlow stödjer export och import av data i CSV-format för att garantera dataportabilitet enligt GDPR.
            </p>
            <ul className="space-y-2">
              {[
                { label: "Mallar", desc: "Exportera och importera checklistmallar (Mallar → Exportera / Importera CSV). Exporterat format kan importeras direkt.", show: true },
                { label: "Uppgifter", desc: "Exportera uppgifter som CSV (Uppgifter → Exportera). Importera nya uppgifter via CSV-mall.", show: true },
                { label: "Avvikelser", desc: "Exportera alla avvikelser som CSV (Avvikelser → Exportera CSV).", show: true },
                { label: "Schema", desc: "Importera personalschema via XML-fil från SoftOne GO (Schema → Importera).", show: true },
                { label: "Personuppgifter", desc: "Administratörer kan exportera personuppgifter via GDPR-export i Inställningar.", show: isManager },
              ].filter(i => i.show).map((item) => (
                <li key={item.label} className="flex gap-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-success" />
                  <span><span className="font-medium">{item.label}:</span> {item.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* API & Automation — endast admin, som hanterar API-nycklarna */}
        {isAdmin && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              API &amp; Automation
            </h2>
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[var(--shadow-sm)] space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Terminal className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Skapa och rotera API-nycklar under{" "}
                    <Link to="/installningar" className="font-medium text-foreground underline underline-offset-2">
                      Inställningar → API-nycklar
                    </Link>
                    . Varje nyckel har en egen uppsättning behörigheter (scopes) och är valfritt låst till en
                    specifik butik. Byt ut <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">&lt;project-ref&gt;</code>{" "}
                    mot ditt Supabase-projekts referens i exemplen nedan.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {CURL_EXAMPLES.map((ex) => (
                  <div key={ex.title} className="space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium">{ex.title}</p>
                      <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {ex.scope}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{ex.description}</p>
                    <pre className="overflow-x-auto rounded-xl bg-muted/60 p-3 text-[11px] leading-relaxed">
                      <code className="font-mono whitespace-pre">{ex.command}</code>
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Support */}
        <section className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-6 py-5 text-center">
          <p className="text-sm font-medium text-foreground">Hittar du inte det du söker?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Kontakta din butiksadministratör eller HK-support.
          </p>
        </section>
      </div>
    </div>
  );
}
