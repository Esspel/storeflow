import { useState } from "react";
import { Store, Users, ClipboardList, ChartBar as BarChart2, ShieldCheck, ChevronRight, CircleCheck as CheckCircle2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

const STEPS = [
  {
    id: "welcome",
    icon: Building2,
    title: "Välkommen till StoreFlow",
    description:
      "StoreFlow är din digitala arbetsplats för att hantera butikens dagliga rutiner, personal, avvikelser och mycket mer.",
    details: [
      "Allt på ett ställe — schema, uppgifter, avvikelser och möten.",
      "Fungerar på mobil, surfplatta och dator.",
      "Synkar i realtid med ditt team.",
    ],
  },
  {
    id: "personal",
    icon: Users,
    title: "Personalhantering",
    description:
      "Under Personal hittar du alla medarbetare kopplade till din butik. Håll kontaktuppgifter och roller uppdaterade.",
    details: [
      "Lägg till och redigera medarbetaruppgifter.",
      "Tilldela hierarkinivåer och behörigheter.",
      "Skapa grupper för enklare uppgiftstilldelning.",
    ],
  },
  {
    id: "schema",
    icon: ClipboardList,
    title: "Schema & Leveransplan",
    description:
      "Importera scheman direkt från SoftOne GO och hantera leveransplaner vecka för vecka.",
    details: [
      "Importera XML-filer från SoftOne GO.",
      "Markera specialveckor med avvikande leverans.",
      "Överskrivning sker automatiskt vid ny import.",
    ],
  },
  {
    id: "tasks",
    icon: Store,
    title: "Uppgifter & Avvikelser",
    description:
      "Skapa uppgifter med checklistor, tilldela ansvariga och följ upp avvikelser från kundrundan.",
    details: [
      "Uppgifter kan vara återkommande eller engångshändelser.",
      "Bilder och kommentarer kan kopplas till varje steg.",
      "Avvikelser loggas och kan eskaleras.",
    ],
  },
  {
    id: "reports",
    icon: BarChart2,
    title: "Rapporter & Analys",
    description:
      "Följ upp butikens prestation med inbyggda rapporter och se hur ni ligger till jämfört med era mål.",
    details: [
      "Uppgiftsstatistik per vecka och månad.",
      "Avvikelsetrender över tid.",
      "Exportera data för vidare analys.",
    ],
  },
  {
    id: "done",
    icon: ShieldCheck,
    title: "Du är redo att börja!",
    description:
      "Du har nu fått en grundläggande genomgång av StoreFlow. Du kan alltid hitta mer hjälp under Inställningar.",
    details: [
      "Börja med att bekräfta att din butiksinformation stämmer.",
      "Bjud in medarbetare om det inte redan är gjort.",
      "Importera veckans schema för att komma igång.",
    ],
  },
];

interface FirstTimeSetupProps {
  onComplete: () => void;
}

export function FirstTimeSetup({ onComplete }: FirstTimeSetupProps) {
  const { user, effectiveStore } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;
  const progress = ((currentStep + 1) / STEPS.length) * 100;

  const Icon = step.icon;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Välkommen,{" "}
            <span className="text-foreground">
              {user?.name ?? user?.username}
            </span>
            {effectiveStore && (
              <> · {effectiveStore.name}</>
            )}
          </p>
          <div className="mt-3 flex items-center gap-2">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                  i <= currentStep ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Steg {currentStep + 1} av {STEPS.length}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-md)]">
          <div className="p-8">
            {/* Icon */}
            <div className="mb-6 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-8 w-8" />
              </div>
            </div>

            {/* Content */}
            <h2 className="mb-2 text-center text-2xl font-bold tracking-tight">
              {step.title}
            </h2>
            <p className="mb-6 text-center text-sm leading-relaxed text-muted-foreground">
              {step.description}
            </p>

            {/* Details */}
            <ul className="space-y-3">
              {step.details.map((detail, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm text-foreground/80">{detail}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border/60 px-8 py-5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                currentStep > 0
                  ? setCurrentStep((s) => s - 1)
                  : onComplete()
              }
              className="text-muted-foreground"
            >
              {currentStep === 0 ? "Hoppa över" : "Tillbaka"}
            </Button>

            <Button
              onClick={() =>
                isLast ? onComplete() : setCurrentStep((s) => s + 1)
              }
              className="gap-2 rounded-full px-6"
            >
              {isLast ? "Kom igång" : "Nästa"}
              {!isLast && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
