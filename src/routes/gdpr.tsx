import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/gdpr")({
  component: GdprPage,
});

function GdprPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-8 md:py-12">
      <Link
        to="/installningar"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-coop-gray-900 hover:text-coop-gray-900 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" /> Tillbaka till Inställningar
      </Link>

      <h1 className="mb-2 text-3xl font-bold tracking-tight">GDPR-information</h1>
      <p className="mb-8 text-sm text-coop-gray-900">Dataskyddsförordningen (EU) 2016/679</p>

      <div className="space-y-8 text-sm text-coop-gray-900 leading-relaxed">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
          <p className="text-coop-gray-900 font-medium mb-1">Vad är GDPR?</p>
          <p>
            GDPR (General Data Protection Regulation) är EU:s dataskyddsförordning som gäller från
            maj 2018. Den ger dig som individ starka rättigheter över dina personuppgifter och
            ställer krav på organisationer som behandlar dem.
          </p>
        </div>

        <section>
          <h2 className="text-lg font-semibold text-coop-gray-900 mb-3">
            Vilka uppgifter behandlas i StoreFlow?
          </h2>
          <div className="space-y-3">
            {[
              [
                "Identitetsuppgifter",
                "Användarnamn, visningsnamn, roll, anställningsgrupp, streckkods-ID.",
              ],
              [
                "Autentiseringsuppgifter",
                "Bcrypt-hashad lösenordssammanfattning (aldrig klartext), PIN-hash.",
              ],
              [
                "Aktivitetsdata",
                "Uppgifter du skapar eller utför, kommentarer, statusändringar med tidsstämplar.",
              ],
              ["Bilder", "Foton du laddar upp i avvikelserapporter eller uppgiftsdokumentation."],
              [
                "Kontaktuppgifter för notiser",
                "Push-prenumerationstoken (enhetsberoende, krypterad).",
              ],
              ["Platsdata", "Ingen GPS- eller positionsdata samlas in."],
            ].map(([type, desc]) => (
              <div key={type} className="flex gap-3 rounded-lg border border-border/60 bg-coop-gray-100 p-3">
                <span className="font-medium text-coop-gray-900 shrink-0 w-48">{type}</span>
                <span>{desc}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-coop-gray-900 mb-3">
            Dina rättigheter enligt GDPR
          </h2>
          <div className="space-y-3">
            {[
              [
                "Rätt till tillgång (Art. 15)",
                "Du har rätt att begära ett registerutdrag med alla uppgifter vi har om dig. Gå till Inställningar → GDPR-export för att ladda ned dina uppgifter.",
              ],
              [
                "Rätt till rättelse (Art. 16)",
                "Du kan korrigera felaktiga uppgifter via Inställningar. Kontakta administratören för övriga rättelser.",
              ],
              [
                "Rätt till radering (Art. 17)",
                "Du kan begära att ditt konto och dina uppgifter raderas. Kontakta din systemadministratör. Notera att revisionsloggar kan behövas behållas av säkerhetsskäl.",
              ],
              [
                "Rätt till begränsning (Art. 18)",
                "Du kan begära att behandlingen av dina uppgifter begränsas under utredning av en tvist om uppgifternas korrekthet.",
              ],
              [
                "Rätt till dataportabilitet (Art. 20)",
                "Du kan begära dina uppgifter i ett maskinläsbart format (JSON) via GDPR-exporten i Inställningar.",
              ],
              [
                "Rätt att invända (Art. 21)",
                "Du kan invända mot behandling som stöds av berättigat intresse. Kontakta din systemadministratör.",
              ],
              [
                "Rätt att inte bli föremål för automatiserat beslut (Art. 22)",
                "StoreFlow fattar inga helt automatiserade beslut med rättslig verkan om enskilda.",
              ],
            ].map(([right, desc]) => (
              <div key={right} className="rounded-lg border border-border/60 bg-coop-gray-100 p-4">
                <p className="font-medium text-coop-gray-900 mb-1">{right}</p>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-coop-gray-900 mb-3">
            Hur utövar jag mina rättigheter?
          </h2>
          <ol className="list-decimal list-inside space-y-2">
            <li>
              <strong className="text-coop-gray-900">GDPR-export:</strong> Gå till Inställningar och
              klicka på "Exportera mina uppgifter" i GDPR-avsnittet.
            </li>
            <li>
              <strong className="text-coop-gray-900">Rättelse:</strong> Ändra ditt visningsnamn direkt
              i Inställningar. Övriga uppgifter via administratören.
            </li>
            <li>
              <strong className="text-coop-gray-900">Radering / invändning:</strong> Kontakta din
              närmaste systemadministratör eller dataskyddsombud.
            </li>
            <li>
              <strong className="text-coop-gray-900">Klagomål:</strong> Du har rätt att inge klagomål
              till Integritetsskyddsmyndigheten (IMY) på{" "}
              <a
                href="https://www.imy.se"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                www.imy.se
              </a>
              .
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-coop-gray-900 mb-3">Lagringstider</h2>
          <div className="space-y-2">
            {[
              ["Aktiva konton", "Tills administratören inaktiverar eller raderar kontot."],
              ["Avklarade uppgifter", "365 dagar (konfigureras av administratören)."],
              ["Revisionsloggar", "90 dagar."],
              ["Push-notis-tokens", "Tills du avaktiverar notiser eller kontot raderas."],
              ["Bilder i avvikelser", "Tills ärendet raderas (följer uppgiftens lagringstid)."],
            ].map(([item, retention]) => (
              <div key={item} className="flex gap-3 rounded-lg border border-border/60 px-3 py-2.5">
                <span className="font-medium text-coop-gray-900 w-48 shrink-0">{item}</span>
                <span>{retention}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-coop-gray-900 mb-3">Databehandlare</h2>
          <div className="rounded-lg border border-border/60 bg-coop-gray-100 p-4">
            <p className="font-medium text-coop-gray-900 mb-1">Supabase Inc.</p>
            <p className="mb-1">Plats: EU-region (Frankfurt, Tyskland).</p>
            <p>
              Supabase behandlar data som underleverantör i enlighet med ett Data Processing
              Agreement (DPA) och är certifierat enligt SOC 2 Type II. Mer information:{" "}
              <a
                href="https://supabase.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                supabase.com/privacy
              </a>
              .
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
