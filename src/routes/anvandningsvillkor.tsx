import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/anvandningsvillkor")({
  component: TosPage,
});

function TosPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-8 md:py-12">
      <Link to="/installningar" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="h-4 w-4" /> Tillbaka till Inställningar
      </Link>

      <h1 className="mb-2 text-3xl font-bold tracking-tight">Användarvillkor</h1>
      <p className="mb-8 text-sm text-muted-foreground">Senast uppdaterad: Juni 2026</p>

      <div className="space-y-8 text-sm text-muted-foreground leading-relaxed">

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">1. Godkännande av villkor</h2>
          <p>
            Genom att logga in och använda StoreFlow godkänner du dessa användarvillkor.
            Om du inte godkänner villkoren ska du inte använda systemet. Kontakta din
            administratör om du har frågor.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">2. Behörighet och åtkomst</h2>
          <ul className="list-disc list-inside space-y-1.5">
            <li>Du är ansvarig för att hålla dina inloggningsuppgifter konfidentiella.</li>
            <li>Dela inte ditt lösenord eller PIN med obehöriga personer.</li>
            <li>Du ska omedelbart rapportera misstänkt obehörig åtkomst till din administratör.</li>
            <li>Åtkomst är personlig och kopplad till din tilldelade roll.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">3. Tillåten användning</h2>
          <p className="mb-2">StoreFlow får endast användas för:</p>
          <ul className="list-disc list-inside space-y-1.5">
            <li>Administrativa arbetsuppgifter i din butiksverksamhet.</li>
            <li>Rapportering av avvikelser och uppföljning av ärenden.</li>
            <li>Schemaläggning och personaladministration.</li>
            <li>Kommunikation och informationsdelning inom din organisation.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">4. Förbjuden användning</h2>
          <p className="mb-2">Det är förbjudet att:</p>
          <ul className="list-disc list-inside space-y-1.5">
            <li>Dela känslig information som inte är avsedd för systemet.</li>
            <li>Ladda upp olagligt, kränkande eller upphovsrättsligt skyddat material.</li>
            <li>Försöka komma åt data som du inte är behörig till.</li>
            <li>Använda systemet för aktiviteter som strider mot lag eller intern policy.</li>
            <li>Automatisera åtkomst på ett sätt som belastar eller skadar systemet.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">5. Innehåll du skapar</h2>
          <p>
            Du ansvarar för allt innehåll du registrerar i systemet — texter, bilder och
            kommentarer. Innehållet ska vara korrekt, relevant och följa din organisations
            riktlinjer. Systemet sparar en revisionslogg av alla ändringar.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">6. Tillgänglighet och underhåll</h2>
          <p>
            Vi strävar efter hög tillgänglighet men kan inte garantera att systemet alltid
            är tillgängligt. Planerat underhåll meddelas i förväg när möjligt. Vi reserverar
            oss för avbrott vid uppdateringar eller driftstörningar.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">7. Immateriella rättigheter</h2>
          <p>
            StoreFlow och dess källkod licensieras under GNU General Public License v3.0.
            Se{" "}
            <Link to="/licens" className="text-primary underline underline-offset-2 hover:no-underline">
              Licens
            </Link>
            {" "}för fullständig information. Innehåll som ditt företag registrerar i systemet
            ägs av din organisation.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">8. Ansvarsbegränsning</h2>
          <p>
            StoreFlow tillhandahålls i befintligt skick utan garantier om lämplighet för
            specifika ändamål. Vi ansvarar inte för direkta, indirekta eller följdskador
            som uppstår till följd av din användning av systemet.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">9. Ändringar av villkoren</h2>
          <p>
            Dessa villkor kan uppdateras. Fortsatt användning av systemet efter att
            uppdaterade villkor publicerats innebär att du godkänner de nya villkoren.
            Datum för senaste uppdatering visas längst upp på denna sida.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">10. Tillämplig lag</h2>
          <p>
            Dessa villkor tolkas och tillämpas i enlighet med svensk lag. Tvister ska
            i första hand lösas i samförstånd.
          </p>
        </section>

      </div>
    </div>
  );
}
