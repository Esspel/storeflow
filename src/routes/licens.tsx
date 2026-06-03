import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/licens")({
  component: LicensePage,
});

function LicensePage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-8 md:py-12">
      <Link to="/installningar" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="h-4 w-4" /> Tillbaka till Inställningar
      </Link>

      <h1 className="mb-2 text-3xl font-bold tracking-tight">Licens</h1>
      <p className="mb-8 text-sm text-muted-foreground">GNU General Public License v3.0</p>

      <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">

        <div className="rounded-xl border border-border/60 bg-muted/30 p-5">
          <p className="font-mono text-xs text-foreground">
            StoreFlow — Butiksdriftssystem<br />
            Copyright (C) 2024–2026 StoreFlow Contributors<br /><br />
            This program is free software: you can redistribute it and/or modify<br />
            it under the terms of the GNU General Public License as published by<br />
            the Free Software Foundation, either version 3 of the License, or<br />
            (at your option) any later version.
          </p>
        </div>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">GNU General Public License version 3</h2>
          <p>
            StoreFlow är fri programvara; du kan använda det, modifiera det och vidaredistribuera
            det under villkoren i GNU General Public License version 3 (GPL-3.0), publicerad av
            Free Software Foundation.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">Dina rättigheter</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Frihet att använda programmet för valfritt ändamål.</li>
            <li>Frihet att studera hur programmet fungerar och anpassa det efter dina behov.</li>
            <li>Frihet att dela vidare kopior av programmet.</li>
            <li>Frihet att dela vidare dina modifierade versioner, under samma licens.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">Villkor</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Källkod ska alltid göras tillgänglig när du distribuerar binärer.</li>
            <li>Modifieringar ska märkas tydligt som ändringar av originalet.</li>
            <li>Verk som härleds från detta program ska licensieras under GPL-3.0.</li>
            <li>Inga ytterligare restriktioner får läggas på mottagarnas rättigheter.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">Garanti</h2>
          <p>
            Programmet levereras UTAN GARANTI, varken uttryckt eller underförstådd.
            Se GPL-3.0 för fullständiga villkor. Du ansvarar själv för alla risker
            förknippade med programmets kvalitet och prestanda.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">Fullständig licens</h2>
          <p>
            Den fullständiga texten för GNU General Public License version 3 finns på:{" "}
            <a
              href="https://www.gnu.org/licenses/gpl-3.0.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:no-underline"
            >
              https://www.gnu.org/licenses/gpl-3.0.html
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">Tredjepartskomponenter</h2>
          <p className="mb-3">StoreFlow använder följande bibliotek med öppen källkod:</p>
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-background p-4 font-mono text-xs">
            {[
              ["React", "MIT", "facebook/react"],
              ["TanStack Router", "MIT", "TanStack/router"],
              ["TanStack Query", "MIT", "TanStack/query"],
              ["Tailwind CSS", "MIT", "tailwindlabs/tailwindcss"],
              ["Supabase JS", "MIT", "supabase/supabase-js"],
              ["Radix UI", "MIT", "radix-ui/primitives"],
              ["Lucide React", "ISC", "lucide-icons/lucide"],
              ["date-fns", "MIT", "date-fns/date-fns"],
              ["Recharts", "MIT", "recharts/recharts"],
              ["Sonner", "MIT", "emilkowalski/sonner"],
              ["Zod", "MIT", "colinhacks/zod"],
              ["ZXing Browser", "Apache-2.0", "zxing-js/browser"],
            ].map(([name, lic, repo]) => (
              <div key={name} className="flex items-center gap-3">
                <span className="w-36 text-foreground">{name}</span>
                <span className="w-20 text-primary">{lic}</span>
                <span className="text-muted-foreground">{repo}</span>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
