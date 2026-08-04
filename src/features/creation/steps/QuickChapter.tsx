/**
 * Quick Start's progressive chapter shell. It owns no creation state: the
 * wizard feeds it the same controls and completion facts as the Guided path.
 */
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import type { GuidedStep } from "./steps";

export function QuickChapter({
  step,
  title,
  summary,
  complete,
  open,
  onToggle,
  children,
}: {
  step: GuidedStep;
  title: string;
  summary?: string;
  complete: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = `quick-chapter-${step}`;

  return (
    <section className="quick-chapter" data-complete={complete || undefined}>
      <button
        id={`${bodyId}-toggle`}
        type="button"
        className="quick-chapter-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-disabled={!complete || undefined}
        onClick={() => {
          if (complete) onToggle();
        }}
      >
        <span className="quick-chapter-mark" aria-hidden>
          {complete ? "✓" : "·"}
        </span>
        <span className="quick-chapter-copy">
          <span className="quick-chapter-title">{title}</span>
          {complete && summary && (
            <span className="quick-chapter-summary" aria-hidden>
              {summary}
            </span>
          )}
        </span>
        <Icon as={ChevronDown} className="quick-chapter-chevron" decorative />
      </button>
      <div
        id={bodyId}
        className="quick-chapter-body"
        role="region"
        aria-labelledby={`${bodyId}-toggle`}
        data-open={open || undefined}
      >
        {children}
      </div>
    </section>
  );
}
