import { useRef, type ReactNode } from "react";

import { useScrollMore } from "./scroll-more";

/** A row of filter chips; on a phone it is one line that scrolls sideways. */
export function Filters({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollMore(ref);
  return (
    <div ref={ref} className="f-filters" role="group" aria-label={label} data-hscroll="">
      {children}
    </div>
  );
}
