import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  value: string;
  masked: string;
  label?: string;
  className?: string;
};

/**
 * Renders a sensitive field with click-to-reveal masking.
 * The masked value is shown by default; click the eye icon to reveal.
 */
export function MaskedField({ value, masked, label, className = "" }: Props) {
  const [revealed, setRevealed] = useState(false);

  if (!value) return <span className="text-muted-foreground/50">—</span>;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {label && <span className="text-muted-foreground">{label}: </span>}
      <span className="font-mono text-sm">
        {revealed ? value : masked}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 shrink-0 rounded text-muted-foreground hover:text-foreground"
        onClick={() => setRevealed((r) => !r)}
        title={revealed ? "Dölj" : "Visa"}
        aria-label={revealed ? "Dölj värde" : "Visa värde"}
      >
        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
    </span>
  );
}
