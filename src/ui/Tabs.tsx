import { useEffect, useId, useRef } from "react";

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
  // a row that scrolls fades at its right edge, so the cut tab reads as "more"
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = () => {
      el.dataset.more = String(
        el.scrollWidth > el.clientWidth + 4 &&
          el.scrollLeft + el.clientWidth < el.scrollWidth - 4
      );
    };
    mark();
    const ro = new ResizeObserver(mark);
    ro.observe(el);
    el.addEventListener("scroll", mark, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", mark);
    };
  }, []);
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
