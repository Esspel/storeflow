import { createFileRoute } from "@tanstack/react-router";
import { Monitor } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/styrtavlor")({
  component: () => (
    <ComingSoon
      icon={Monitor}
      title="Digitala Styrtavlor"
      description="Fullscreen-läge för TV och tablets på butiksgolvet och huvudkontoret."
      features={[
        "Fullscreen mode",
        "KPI:er & topplistor",
        "Schemalagda vyer",
        "Slideshow",
        "Realtidsuppdatering",
        "Rollbaserade dashboards",
      ]}
    />
  ),
});
