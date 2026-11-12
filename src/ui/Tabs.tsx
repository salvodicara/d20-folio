import { useId, useLayoutEffect, useRef } from "react";

import { scrollLeftToShow, useScrollMore } from "./scroll-more";

/** The fade at a cut edge (ui.css `.f-tabs[data-more]`). */
const FADE = 56;

/** A row of tabs; it scrolls sideways when it does not fit, each cut edge fades, and
 *  the selected tab is always shown whole. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useScrollMore(ref);
  useLayoutEffect(() => {
    const row = ref.current;
    const tab = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (row && tab) row.scrollLeft = scrollLeftToShow(row, tab, FADE);
  }, [value]);
  return (
    <div ref={ref} className="f-tabs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button
          key={t.id}
          id={`${id}-${t.id}`}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
