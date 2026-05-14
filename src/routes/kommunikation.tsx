import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/kommunikation")({
  component: () => (
    <ComingSoon
      icon={MessageSquare}
      title="Kommunikation"
      description="Internt operations-center mellan huvudkontor, regionchefer, butikschefer och personal."
      features={[
        "Intern chatt & gruppkommunikation",
        "Digital anslagstavla",
        "Läskvitton & pushnotiser",
        "Kampanjutskick",
        "Dokumentdelning",
        "Kommentarstrådar",
      ]}
    />
  ),
});
