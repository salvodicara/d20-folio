import type { IconName } from "./icon-names";

/** One icon from the sprite, named by meaning (g- game concept, u- interface command). Decorative unless labelled. */
export function Icon({
  name,
  size = 16,
  label,
}: {
  name: IconName;
  size?: number;
  label?: string;
}) {
  return (
    <svg
      className="f-ic"
      width={size}
      height={size}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <use href={`/assets/ui-icons.svg#${name}`} />
    </svg>
  );
}
