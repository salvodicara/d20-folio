/**
 * ChargeUse — magic-item charge counter + Use control (wands / staves / scrolls).
 * The counter is a mono "X / Y" in the semantic info token; Use spends one charge
 * via the brass `Button` vocabulary. Disabled (and dimmed) at 0 charges.
 */
import { Button } from "@/components/ui/button";

export function ChargeUse({
  current,
  max,
  onUse,
  chargesLabel,
  useLabel,
  useTitle,
}: {
  current: number;
  max: number;
  onUse: () => void;
  chargesLabel: string;
  useLabel: string;
  useTitle: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="font-mono text-[0.65rem] font-bold text-info"
        title={chargesLabel}
        aria-label={`${chargesLabel}: ${current} / ${max}`}
      >
        {current} / {max}
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={current <= 0}
        title={useTitle}
        onClick={(e) => {
          e.stopPropagation();
          onUse();
        }}
      >
        {useLabel}
      </Button>
    </span>
  );
}
