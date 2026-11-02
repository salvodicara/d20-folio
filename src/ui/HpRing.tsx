/** A portrait inside the HP ring: green, yellow under half, red at a quarter; temporary HP as a blue arc. */
export function HpRing({
  hp,
  max,
  temp = 0,
  size = 56,
  portrait,
}: {
  hp: number;
  max: number;
  temp?: number;
  size?: number;
  portrait?: string;
}) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const p = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  const t = max > 0 ? Math.min(1 - p, temp / max) : 0;
  const color = p > 0.5 ? "var(--hp)" : p > 0.25 ? "var(--hp-y)" : "var(--hp-r)";
  const inset = size * 0.12;
  return (
    <span className="f-ring" style={{ width: size, height: size }}>
      {portrait && (
        <img
          src={portrait}
          alt=""
          style={{ inset, width: size - 2 * inset, height: size - 2 * inset }}
        />
      )}
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          style={{ stroke: "var(--ring-track)" }}
          strokeWidth="6"
        />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`}
        />
        {t > 0 && (
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke="var(--temp)"
            strokeWidth="4"
            strokeDasharray={`${c * t} ${c}`}
            strokeDashoffset={-c * p}
          />
        )}
      </svg>
    </span>
  );
}
