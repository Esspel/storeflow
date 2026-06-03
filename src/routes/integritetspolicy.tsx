import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/integritetspolicy")({
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-8 md:py-12">
      <Link to="/installningar" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="h-4 w-4" /> Tillbaka till Inställningar
      </Link>

      <h1 className="mb-2 text-3xl font-bold tracking-tight">Integritetspolicy</h1>
      <p className="mb-8 text-sm text-muted-foreground">Senast uppdaterad: Juni 2026</p>

      <div className="prose prose-sm max-w-none space-y-8 text-foreground">

        <section>
          <h2 className="text-xl font-semibold mb-3">1. Personuppgiftsansvarig</h2>
          <p className="text-muted-foreground leading-relaxed">
            StoreFlow är ett internt verksamhetssystem. Den organisation eller det företag som
            administrerar er StoreFlow-installation är personuppgiftsansvarig för de uppgifter
            som behandlas i systemet.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">2. Vilka uppgifter samlar vi in?</h2>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex gap-2"><span className="text-foreground font-medium shrink-0">Kontouppgifter:</span> Användarnamn, visningsnamn, lösenordshash (aldrig i klartext), roll och anställningsgrupp.</li>
            <li className="flex gap-2"><span className="text-foreground font-medium shrink-0">Aktivitetsdata:</span> Uppgifter du skapar, kompletterar eller kommenterar, inklusive tidsstämplar.</li>
            <li className="flex gap-2"><span className="text-foreground font-medium shrink-0">Avvikelserapporter:</span> Beskrivningar, bilder och statusinformation kopplade till specifika ärenden.</li>
            <li className="flex gap-2"><span className="text-foreground font-medium shrink-0">Sessionsdata:</span> Inloggningstidpunkt och sista inloggning för säkerhetsspårning.</li>
            <li className="flex gap-2"><span className="text-foreground font-medium shrink-0">Pushnotiser:</span> Prenumerationstokens om du väljer att aktivera notiser (lagras lokalt och i databasen).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">3. Ändamål med behandlingen</h2>
          <p className="text-muted-foreground leading-relaxed mb-2">Vi behandlar personuppgifter för att:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>Möjliggöra inloggning och åtkomstkontroll till systemet.</li>
            <li>Tilldela och följa upp arbetsuppgifter och kontroller.</li>
            <li>Generera rapporter och statistik för verksamhetsförbättring.</li>
            <li>Upprätthålla ett spårbart revisionslogg för interna ändamål.</li>
            <li>Skicka arbetsrelaterade push-notifikationer (om du aktiverat det).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">4. Laglig grund</h2>
          <p className="text-muted-foreground leading-relaxed">
            Behandlingen sker med stöd av <strong>berättigat intresse</strong> (art. 6.1 f GDPR)
            att administrera och driva verksamheten effektivt, samt i förekommande fall
            <strong> fullgörande av avtal</strong> (art. 6.1 b GDPR) i förhållande till anställda.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">5. Lagringstid</h2>
          <p className="text-muted-foreground leading-relaxed">
            Uppgifter sparas så länge de är relevanta för verksamheten. Avslutade konton och
            inaktiva uppgifter rensas i enlighet med den datalagringsperiod som administratören
            konfigurerat (standard 365 dagar för avklarade uppgifter). Revisionsloggar behålls
            i 90 dagar.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">6. Dina rättigheter</h2>
          <p className="text-muted-foreground leading-relaxed mb-2">Enligt GDPR har du rätt att:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>Begära tillgång till dina personuppgifter (registerutdrag).</li>
            <li>Begära rättelse av felaktiga uppgifter.</li>
            <li>Begära radering ("rätten att bli glömd") där tillämpligt.</li>
            <li>Invända mot behandling som stöds av berättigat intresse.</li>
            <li>Begära begränsning av behandlingen.</li>
            <li>Begära dataportabilitet (export av dina uppgifter via Inställningar &rarr; GDPR-export).</li>
          </ul>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Kontakta din systemadministratör för att utöva dina rättigheter.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">7. Säkerhet</h2>
          <p className="text-muted-foreground leading-relaxed">
            Alla lösenord hanteras som bcrypt-hashar och lagras aldrig i klartext.
            Dataöverföring sker krypterat via HTTPS/TLS. Databasen är skyddad med
            Row Level Security (RLS) som säkerställer att varje användare bara kan
            läsa och skriva data de är behöriga till.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">8. Tredjeparter</h2>
          <p className="text-muted-foreground leading-relaxed">
            StoreFlow använder Supabase (EU-databehandlare) för databaslagring och autentisering.
            Supabase är certifierat enligt SOC 2 och GDPR-kompatibelt. Inga uppgifter säljs
            eller delas med obehöriga tredjeparter.
          </p>
        </section>

      </div>
    </div>
  );
}
