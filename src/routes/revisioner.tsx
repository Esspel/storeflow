import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/revisioner")({
  component: () => (
    <ComingSoon
      icon={ClipboardCheck}
      title="Revisioner"
      description="Audits, kvalitetskontroller och compliance med poängsystem och fotoverifiering."
      features={[
        "Revisionsmallar",
        "Poängsystem & jämförelser",
        "Fotoverifiering",
        "Brand- & hygienkontroll",
        "Signering",
        "Historik per butik",
      ]}
    />
  ),
});
