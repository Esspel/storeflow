import { createFileRoute, Link } from "@tanstack/react-router";
import { TriangleAlert as AlertTriangle, ChartBar as BarChart2, CalendarDays, CircleCheck as CheckCircle2, ChevronRight, ClipboardList, FileText, Keyboard, LayoutDashboard, ListChecks, MessageSquare, Package, QrCode, Settings, ShoppingCart, Tv as Tv2, UserRound, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
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
};

const FEATURES: { section: string; items: Feature[] }[] = [
  {
    section: "Navigation",
    items: [
      {
        title: "Dashboard",
        description: "Översikt över dagens uppgifter, sena uppgifter och öppna avvikelser.",
        icon: LayoutDashboard,
        path: "/",
      },
      {
        title: "Uppgifter",
        description: "Skapa, tilldela och slutför uppgifter. Stöd för återkommande uppgifter, checklistor med foton och multi-tilldelning.",
        icon: ListChecks,
        path: "/uppgifter",
        steps: [
          "Svep höger på en uppgift (mobil) för att markera den som klar",
          "Svep vänster för att öppna detaljvyn",
          "Tryck länge för att se uppgiftens steg och frågor",
        ],
      },
      {
        title: "Schema",
        description: "Importera personalschema via XML från SoftOne GO. Visa skift per dag och medarbetare.",
        icon: CalendarDays,
        path: "/schema",
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
        steps: [
          "Tryck 'Ny avvikelse' eller QR-ikonen (mobil: liten cirkelknapp till vänster om plus-knappen)",
          "Välj vanlig avvikelse för snabbval av ofta förekommande problem",
          "Chefer: generera QR-koder per avdelning via 'QR-koder'-knappen",
          "Exportera alla avvikelser som CSV via 'Exportera CSV'",
        ],
        tip: "QR-koder för avvikelser kan skannas av vem som helst utan inloggning — perfekt att sätta upp i butiken.",
      },
      {
        title: "Kundönskemål",
        description: "Håll koll på vad kunder önskar. Statusflöde från inkommit till uppfyllt.",
        icon: ShoppingCart,
        path: "/kundonskemal",
        steps: [
          "Tryck QR-ikonen på ett önskemål för att få en länk att dela med kunden",
          "Kunden kan följa status (Inkommit → Beställd → Uppfylld) utan att logga in",
          "Scanna EAN-streckkod direkt i formuläret",
        ],
      },
      {
        title: "Möten",
        description: "Planera och genomför möten med tidsbudgeterad agenda och beslutslogg.",
        icon: MessageSquare,
        path: "/moten",
        steps: [
          "Skapa mötestyper med standardagendor under 'Mötestyper'",
          "Starta ett möte för att aktivera agenda-timers",
          "Lägg till beslut under mötet — de kan automatiskt skapa uppgifter",
          "När mötet är slutfört: tryck 'Exportera protokoll' för ett utskriftsklart PDF-protokoll",
        ],
        tip: "PDF-protokollet öppnas i webbläsarens skriv-ut-dialog. Välj 'Spara som PDF' som skrivare.",
      },
      {
        title: "Kundrunda",
        description: "Genomför strukturerade butiksronder med checkpoints, zonpoäng och avvikelseregistrering.",
        icon: UserRound,
        path: "/kundrunda",
      },
      {
        title: "Rapporter",
        description: "Statistik över uppgiftsefterlevnad, avvikelser och kundrundaresultat. CSV-export.",
        icon: BarChart2,
        path: "/rapporter",
      },
      {
        title: "Mallar",
        description: "Bygg checklistmallar som återanvänds för att skapa uppgifter. HK kan skapa globala mallar.",
        icon: ClipboardList,
        path: "/mallar",
      },
    ],
  },
  {
    section: "Chef & Admin",
    items: [
      {
        title: "Personal & Roller",
        description: "Hantera medarbetare, roller, grupper och butiksåtkomst.",
        icon: Users,
        path: "/personal",
        steps: [
          "Skapa ny användare och tilldela butik",
          "Återställ PIN eller streckkod för en medarbetare",
          "Administratörer kan skapa användare på alla hierarkinivåer",
        ],
      },
      {
        title: "Medarbetarbelastning",
        description: "Vy över hur många uppgifter varje medarbetare har tilldelade innevarande vecka.",
        icon: BarChart2,
        path: "/belastning",
        steps: [
          "Visar klar/pågår/sen/att-göra per person",
          "Staplar är relativa — den med flest uppgifter fyller hela bredden",
          "Endast chefer och admins har åtkomst",
        ],
      },
    ],
  },
  {
    section: "Specialfunktioner",
    items: [
      {
        title: "Pulstavla (TV-vy)",
        description: "En helskärmsvy för butiksmonitor/TV som visar dagens uppgifter och öppna avvikelser i realtid.",
        icon: Tv2,
        path: "/pulstavla",
        steps: [
          "Gå till Inställningar → Pulstavla PIN och sätt en 4-siffrig PIN för din butik",
          "Öppna /pulstavla på TV:n eller en dedikerad surfplatta",
          "Välj butik och ange PIN — vyn låses upp",
          "Uppdateras automatiskt var 30 sekund och via Realtime-events",
        ],
        tip: "PIN-koden skyddar mot att intern butiksinformation läcker ut på internet. Sätt alltid en PIN.",
      },
      {
        title: "QR-avvikelse",
        description: "Publik sida (ingen inloggning krävs) för snabbregistrering av avvikelse via QR-kod.",
        icon: QrCode,
        steps: [
          "Gå till Avvikelser → klicka 'QR-koder' (desktop) eller QR-ikonen (mobil)",
          "Ange avdelningsnamn, t.ex. 'Mejeri', och välj kategori",
          "Kopiera länken och generera QR via en extern QR-generator (t.ex. qr-code-generator.com)",
          "Sätt upp QR-koden i butiken — personal kan rapportera utan att logga in",
        ],
      },
      {
        title: "Kundönskemål-status QR",
        description: "Dela en statuslänk med kunden så de kan följa sitt önskemål utan inloggning.",
        icon: Package,
        steps: [
          "Gå till Kundönskemål och tryck QR-ikonen på ett önskemål",
          "Kopiera länken och dela med kunden (SMS, e-post, utskrift)",
          "Länken visar en tidslinje: Inkommit → Beställd → Finns i butiken",
          "Länken är giltig i 30 dagar",
        ],
      },
      {
        title: "PDF-mötesprotokoll",
        description: "Exportera ett slutfört mötes agenda, beslut och åtgärdspunkter som PDF.",
        icon: FileText,
        steps: [
          "Öppna ett möte med status 'Slutfört'",
          "Tryck 'Exportera protokoll' i knappfältet ELLER dokumentikonen i dialogens övre hörn",
          "Webbläsarens skriv-ut-dialog öppnas — välj 'Spara som PDF'",
        ],
        tip: "Protokollet innehåller agenda med tidsstatus, alla beslut med ansvariga och förfallodatum.",
      },
      {
        title: "Snabbt användarbyte",
        description: "Byt användare på en delad Zebra-enhet utan att logga ut och in.",
        icon: Users,
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
    items: [
      {
        title: "Inställningar",
        description: "Profilinformation, lösenordsbyte, PIN, streckkod, push-notiser och Pulstavla PIN.",
        icon: Settings,
        path: "/installningar",
        steps: [
          "Ändra visningsnamn under 'Profil'",
          "Sätt din personliga 4-siffriga PIN under 'Snabbt användarbyte'",
          "Chefer: sätt butikens Pulstavla-PIN längre ned på sidan",
          "Aktivera push-notiser för att få aviseringar direkt på enheten",
          "Tryck på versionsnumret 7 gånger för att öppna diagnostikpanelen",
        ],
      },
    ],
  },
];

const KEYBOARD_SHORTCUTS = [
  { key: "?", description: "Öppna/stäng denna genvägsöversikt" },
  { key: "1", description: "Gå till Dashboard" },
  { key: "2", description: "Gå till Uppgifter" },
  { key: "3", description: "Gå till Schema" },
  { key: "4", description: "Gå till Avvikelser" },
  { key: "5", description: "Gå till Kundönskemål" },
  { key: "6", description: "Gå till Möten" },
  { key: "7", description: "Gå till Kundrunda" },
  { key: "8", description: "Gå till Rapporter" },
  { key: "9", description: "Gå till Personal" },
  { key: "0", description: "Gå till Inställningar" },
  { key: "b", description: "Gå till Medarbetarbelastning" },
  { key: "p", description: "Gå till Pulstavla" },
  { key: "Esc", description: "Stäng öppen dialog eller genvägsöversikt" },
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
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        title="Hjälp & Manual"
        description="Hur alla funktioner i StoreFlow fungerar."
      />

      <div className="space-y-10">
        {/* Keyboard shortcuts */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Tangentbordsgenvägar
            </h2>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-sm)] overflow-hidden">
            <div className="border-b border-border/60 bg-muted/30 px-5 py-3">
              <p className="text-sm text-muted-foreground">
                Fungerar när du inte skriver i ett inmatningsfält. Tryck{" "}
                <kbd className="rounded border border-border/60 bg-card px-1.5 py-0.5 font-mono text-xs">?</kbd>{" "}
                var som helst i appen för att visa/dölja genvägsöversikten.
              </p>
            </div>
            <div className="divide-y divide-border/40">
              {KEYBOARD_SHORTCUTS.map((s) => (
                <div key={s.key} className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-foreground">{s.description}</span>
                  <kbd className="shrink-0 rounded-lg border border-border/60 bg-muted px-2.5 py-1 font-mono text-xs font-semibold text-muted-foreground">
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature sections */}
        {FEATURES.map((group) => (
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
