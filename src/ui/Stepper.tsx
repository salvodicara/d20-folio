/** A whole number picked between `min` and `max` with − and + (and typed). */
export function Stepper({
  value,
  min,
  max,
  label,
  less,
  more,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  /** The field's name for a screen reader (the visible label sits beside it). */
  label: string;
  less: string;
  more: string;
  onChange: (value: number) => void;
}) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Math.round(n))));
  return (
    <div className="f-stepper" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={less}
        aria-disabled={value <= min || undefined}
        onClick={() => value > min && set(value - 1)}
      >
        −
      </button>
      <input
        className="f-in"
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) set(n);
        }}
      />
      <button
        type="button"
        aria-label={more}
        aria-disabled={value >= max || undefined}
        onClick={() => value < max && set(value + 1)}
      >
        +
      </button>
    </div>
  );
}
