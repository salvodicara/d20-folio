/**
 * Button — folio "Pressed Brass" atom (§16).
 *
 * Skinned from previews/folio_design/app.css `.btn`. Heavy bevel, metallic
 * gradient on primary/destructive, embossed stone on secondary, physical-press
 * active state via the Motion-B spring. The vocabulary every other interactive
 * atom inherits.
 *
 * Variants: primary (default CTA) · secondary · destructive · ghost · dashed ·
 * neutral (the bare `.btn` resting tier — no gradient; the base other recipes
 * layer a tint onto, e.g. the HP damage/heal/temp controls).
 * Sizes: sm · md (default) · lg, plus `iconOnly` for square icon buttons.
 * `loading` swaps the label for a spinner and blocks interaction.
 * `asChild` renders the brass styling onto a child element (e.g. a router link).
 */

import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva("btn", {
  variants: {
    variant: {
      primary: "primary",
      secondary: "secondary",
      destructive: "destructive",
      ghost: "ghost",
      dashed: "dashed",
      // The bare `.btn` resting tier (no gradient) — the base that bespoke
      // recipes tint via className (HP damage/heal/temp, neutral icon buttons).
      neutral: "",
    },
    size: {
      sm: "sm",
      md: "",
      lg: "lg",
      icon: "icon-only",
    },
    iconOnly: {
      true: "icon-only",
      false: "",
    },
    block: {
      true: "block",
      false: "",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
    iconOnly: false,
    block: false,
  },
});

export interface ButtonProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color">,
    VariantProps<typeof buttonVariants> {
  /** Render the brass styling onto the child element instead of a <button>. */
  asChild?: boolean;
  /** Swap the label for a spinner and disable interaction. */
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  iconOnly,
  block,
  asChild = false,
  loading = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        buttonVariants({ variant, size, iconOnly, block }),
        loading && "loading",
        className
      )}
      // Slot forwards to its child; native <button> needs an explicit type.
      {...(asChild ? {} : { type: type ?? "button" })}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      {...props}
    >
      {children}
    </Comp>
  );
}
