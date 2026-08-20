/**
 * ChargeUse — magic-item charge counter + Use control (wands / staves / scrolls).
 * The counter is a mono "X / Y" in the semantic info token; Use spends one charge
 * via the brass `Button` vocabulary. Disabled (and dimmed) at 0 charges.
 */
import { Button } from "@/components/ui/button";

export function ChargeUse({
  current,
  max,
  disabled = false,
  uninitializedLabel,
  onUse,
  chargesLabel,
  useLabel,
  useTitle,
}: {
  current: number | null;
  max: number | null;
  /** Additional rules-derived gate (equip, attunement, disposition, disabled pool). */
  disabled?: boolean;
  /** Honest display while the first command still needs a table-entered roll. */
  uninitializedLabel?: string;
  onUse: () => void;
  chargesLabel: string;
  useLabel: string;
  useTitle: string;
}) {
  const count =
    current == null || max == null ? (uninitializedLabel ?? "—") : `${current} / ${max}`;

  return (
    <span className="flex items-center gap-1.5">
      <span
        className="font-mono text-[0.65rem] font-bold text-info"
        title={chargesLabel}
        aria-label={`${chargesLabel}: ${count}`}
      >
        {count}
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || current === 0}
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
