import { useState, useEffect, useCallback } from "react";
import { 
  Store, 
  Users, 
  ClipboardList, 
  ChartBar as BarChart2, 
  ShieldCheck, 
  ChevronRight, 
  ChevronLeft,
  CircleCheck as CheckCircle2, 
  Building2 
} from "lucide-react";
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
  const isFirst = currentStep === 0;

  const handleNext = useCallback(() => {
    if (isLast) {
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }, [isLast, onComplete]);

  const handlePrev = useCallback(() => {
    if (isFirst) {
      onComplete();
    } else {
      setCurrentStep((s) => s - 1);
    }
  }, [isFirst, onComplete]);

  // Tangentbordsnavigering (Vänster/Höger pil)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        handleNext();
      } else if (e.key === "ArrowLeft" && !isFirst) {
        handlePrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev, isFirst]);

  const Icon = step.icon;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div 
        className="w-full max-w-lg"
        role="region"
        aria-roledescription="carousel"
        aria-label="Introduktionsguide"
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Välkommen,{" "}
            <span className="font-semibold text-foreground">
              {user?.name ?? user?.username}
            </span>
            {effectiveStore && (
              <> · <span className="text-foreground/90">{effectiveStore.name}</span></>
            )}
          </p>

          {/* Stegindikatorer (Progressbar) */}
          <div 
            className="mt-3 flex items-center gap-1.5"
            role="progressbar"
            aria-valuenow={currentStep + 1}
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
          >
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setCurrentStep(i)}
                className="h-2 flex-1 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Gå till steg ${i + 1}: ${s.title}`}
              >
                <div
                  className={`h-full w-full rounded-full transition-colors duration-300 ${
                    i <= currentStep ? "bg-primary" : "bg-border"
                  }`}
                />
              </button>
            ))}
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Steg {currentStep + 1} av {STEPS.length}
          </p>
        </div>

        {/* Huvudkort */}
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-md)] transition-all">
          <div key={step.id} className="animate-in fade-in-50 duration-200 p-6 sm:p-8">
            {/* Ikon */}
            <div className="mb-6 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
                <Icon className="h-8 w-8" aria-hidden="true" />
              </div>
            </div>

            {/* Rubrik & Beskrivning */}
            <h2 className="mb-2 text-center text-2xl font-bold tracking-tight text-foreground">
              {step.title}
            </h2>
            <p className="mb-6 text-center text-sm leading-relaxed text-muted-foreground">
              {step.description}
            </p>

            {/* Detaljlista */}
            <ul className="space-y-3">
              {step.details.map((detail, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-sm text-foreground/80 leading-normal">{detail}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Footer / Navigering */}
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-6 sm:px-8 py-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              className="gap-1 text-muted-foreground hover:text-foreground"
            >
              {!isFirst && <ChevronLeft className="h-4 w-4" />}
              {isFirst ? "Hoppa över" : "Tillbaka"}
            </Button>

            <Button
              onClick={handleNext}
              className="gap-2 rounded-full px-6 shadow-sm"
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
