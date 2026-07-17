/**
 * Icon — folio inline-SVG sizing wrapper for lucide-react.
 *
 * lucide-react renders an <svg> that inherits currentColor and respects the
 * `.icon`/`.icon-sm`/`.icon-lg` size classes from folio.css (we size via class,
 * not the lucide `size` prop, so a single CSS contract drives every glyph).
 *
 * Usage:
 *   <Icon as={Sparkles} />            // 18px
 *   <Icon as={Trash2} size="sm" />    // 14px
 *   <Icon as={Plus} size="lg" decorative />
 */

import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";

export type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<IconSize, string> = {
  xs: "icon icon-xs",
  sm: "icon icon-sm",
  md: "icon",
  lg: "icon icon-lg",
  xl: "icon icon-xl",
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  /** A lucide-react icon component (e.g. `Sparkles`). */
  as: ComponentType<SVGProps<SVGSVGElement>>;
  size?: IconSize;
  /** Mark purely-decorative icons hidden from assistive tech. */
  decorative?: boolean;
  /** Accessible label; when set the icon is exposed as an img to AT. */
  label?: string;
}

export function Icon({
  as: Glyph,
  size = "md",
  decorative,
  label,
  className,
  ...props
}: IconProps) {
  const a11y = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": decorative ?? true };
  return (
    <Glyph
      className={cn(SIZE_CLASS[size], className)}
      // lucide draws strokes; the .icon class already sets stroke geometry.
      {...a11y}
      {...props}
    />
  );
}
