import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The one decisive action of a screen as a round medallion (BG3's «End Turn»,
 * BG3-STYLE §4): a ring with the label inside. One per screen at most; every other
 * action is a pill `Button`.
 */
export function Medallion({
  children,
  ...button
}: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="f-medallion" {...button}>
      <span>{children}</span>
    </button>
  );
}
