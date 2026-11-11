import { useId, useRef } from "react";

import { useScrollMore } from "./scroll-more";

/** A row of tabs; it scrolls sideways when it does not fit. */
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
