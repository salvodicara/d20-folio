import { useId, type CSSProperties } from "react";

import { initialOf } from "./initial";

/**
 * A portrait inside the HP ring: green, yellow under half, red at a quarter; temporary HP as a blue arc.
 * Without a portrait it shows the name's initial in the panel's colour.
 */
export function HpRing({
  hp,
  max,
  temp = 0,
  size = 56,
  portrait,
  name,
  ornate = false,
}: {
  hp: number;
  max: number;
  temp?: number;
  size?: number;
  portrait?: string;
  name?: string;
  /** The Play header's medal (prototype .medal): gradient arcs that glow, gold rims. */
  ornate?: boolean;
}) {
  const id = `ring${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const r = 28;
  const c = 2 * Math.PI * r;
  const p = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  const t = max > 0 ? Math.min(1 - p, temp / max) : 0;
  const flat = p > 0.5 ? "var(--hp)" : p > 0.25 ? "var(--hp-y)" : "var(--hp-r)";
  const color = ornate && p > 0.5 ? `url(#${id}-hp)` : flat;
  const tempColor = ornate ? `url(#${id}-temp)` : "var(--temp)";
  const glow = ornate ? `url(#${id}-glow)` : undefined;
  const inset = size * 0.12;
  return (
    <span
      className="f-ring"
      style={
        {
          width: size,
          height: size,
          // the initial grows with the ring, never below the base text size
          "--ring-ini": `${String(Math.max(16, Math.round(size * 0.34)))}px`,
        } as CSSProperties
      }
    >
      {portrait ? (
        <img
          src={portrait}
          alt=""
          style={{ inset, width: size - 2 * inset, height: size - 2 * inset }}
        />
      ) : (
        name && (
          <span className="f-ring-ini" style={{ inset }} aria-hidden="true">
            {initialOf(name)}
          </span>
        )
      )}
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        {ornate && (
          <defs>
            <linearGradient id={`${id}-hp`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: "var(--ring-hp-lo)" }} />
              <stop offset=".5" style={{ stopColor: "var(--ring-hp-mid)" }} />
              <stop offset="1" style={{ stopColor: "var(--ring-hp-hi)" }} />
            </linearGradient>
            <linearGradient id={`${id}-temp`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--ring-temp-hi)" }} />
              <stop offset=".5" style={{ stopColor: "var(--ring-temp-mid)" }} />
              <stop offset="1" style={{ stopColor: "var(--ring-temp-lo)" }} />
            </linearGradient>
            <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--rim-hi)" }} />
              <stop offset=".5" style={{ stopColor: "var(--rim-mid)" }} />
              <stop offset="1" style={{ stopColor: "var(--rim-lo)" }} />
            </linearGradient>
            <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        )}
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
          filter={glow}
        />
        {t > 0 && (
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={tempColor}
            strokeWidth="4"
            strokeDasharray={`${c * t} ${c}`}
            strokeDashoffset={-c * p}
            filter={glow}
          />
        )}
        {ornate && (
          <>
            <circle
              cx="32"
              cy="32"
              r="31.2"
              fill="none"
              stroke={`url(#${id}-rim)`}
              strokeWidth="1"
            />
            <circle
              cx="32"
              cy="32"
              r="24.6"
              fill="none"
              stroke={`url(#${id}-rim)`}
              strokeWidth="0.7"
            />
          </>
        )}
      </svg>
    </span>
  );
}
