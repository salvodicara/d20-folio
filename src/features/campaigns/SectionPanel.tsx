/**
 * SectionPanel — the campaign workspace's one section anatomy.
 *
 * The fixed at-a-glance body always renders; only the bulky archive/detail folds.
 * Creation actions share the trailing header cluster; archive disclosure keeps the
 * owner-approved gilt knob docked inside the card. The chevron keeps its full bilingual
 * aria intent and the detail reveals through the single grid-rows animation. Open state remains
 * sticky per campaign × section; a section without detail has no dishonest toggle.
 */

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { InfoCard } from "@/components/shared/InfoCard";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useCampaignStore } from "@/features/campaigns/campaignStore";

/** Read the persisted detail-open state for a key (falls back to `fallback`). */
function readOpen(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
}

export function SectionPanel({
  sectionId,
  title,
  count,
  meta,
  headerAction,
  children,
  detail,
  showLabel,
  hideLabel,
  defaultOpen = false,
  framed = false,
  className,
}: {
  /** Stable id — the aria target, the detail's body id, and the localStorage namespace. */
  sectionId: string;
  title: ReactNode;
  /** A NUMERIC at-a-glance count (sessions / notes / chapters) rendered as the struck
   *  gilt MEDALLION beside the title. Kept visible whether the detail is open or closed
   *  (folding never hides signal). For counts only — a string total ("145 gp") rides
   *  `meta` (the far-right slot) instead. */
  count?: number;
  /** A NON-count at-a-glance signal kept visible whether the detail is open or closed
   *  (a gold total like "145 gp", a status badge). Rendered far-right. */
  meta?: ReactNode;
  /** Primary section action, seated consistently in the rubric's trailing controls. */
  headerAction?: ReactNode;
  /** The FIXED panel — the key signal + primary actions, always rendered. */
  children: ReactNode;
  /** The optional collapsible detail (the bulky secondary list). Omit it to render a
   *  static header with no disclosure (an empty ledger, a one-item board). */
  detail?: ReactNode;
  /** Worded intent when the detail is CLOSED (e.g. "Show transactions (12)"). Required
   *  whenever `detail` is supplied — now the chevron's `aria-label` (no visible text). */
  showLabel?: string;
  /** Worded intent when the detail is OPEN (e.g. "Hide transactions") — the chevron's
   *  `aria-label` while expanded. */
  hideLabel?: string;
  /** Initial detail-open state on the first visit (before a sticky choice exists). */
  defaultOpen?: boolean;
  /** Keep the `.section-card` surface even when `detail` is absent (no disclosure,
   *  just the frame). For sections whose children are BARE content (Sessions' rows,
   *  the notes board's empty line): without it a 0/1-item section floated card-less on
   *  the backdrop while its populated sibling wore the card — the same class of bug
   *  the Treasury empty-ledger fix closed. Sections that bring their OWN surface
   *  (Chronicle's book-spread, DM Tools' card grid, Access's InfoCard) omit it. */
  framed?: boolean;
  /** Extra classes on the panel root — the hub uses it to span a band full-width
   *  (`lg:col-span-2`) in the two-column dashboard grid. */
  className?: string;
}) {
  // Namespace the preference by campaign so a folded detail in one realm never
  // carries into another. The hub only mounts these once a campaign is present.
  const campaignId = useCampaignStore((s) => s.campaign?.id) ?? "";
  const storageKey = `d20.campaignSection.${campaignId}.${sectionId}`;

  const [open, setOpen] = useState(() => readOpen(storageKey, defaultOpen));
  // Re-read when the key changes (navigating between campaigns reuses this instance,
  // so each realm shows its OWN remembered fold state) — the React "adjust state on
  // prop change" pattern (during render, no effect), so it never cascades a commit.
  const [prevKey, setPrevKey] = useState(storageKey);
  if (prevKey !== storageKey) {
    setPrevKey(storageKey);
    setOpen(readOpen(storageKey, defaultOpen));
  }

  const headId = `${sectionId}-head`;
  const detailId = `${sectionId}-detail`;

  function toggle(): void {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // Private mode / disabled storage — the fold still works for this session.
      }
      return next;
    });
  }

  const headerControls =
    meta || headerAction ? (
      <span className="section-head-controls">
        {meta}
        {headerAction}
      </span>
    ) : undefined;

  return (
    <section aria-labelledby={headId} className={cn("section-panel", className)}>
      <SectionHeader
        as="h2"
        tight
        id={headId}
        title={title}
        count={count}
        meta={headerControls}
      />
      {detail ? (
        // ONE card encloses the fixed panel + expandable detail. The header owns the
        // controls; the detail still grows this same surface in place.
        <InfoCard className="section-card">
          {children}
          <button
            type="button"
            className="section-disclosure"
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={open ? hideLabel : showLabel}
            onClick={toggle}
          >
            <span className="section-disclosure-knob">
              <Icon
                as={ChevronDown}
                size="sm"
                decorative
                className={cn(open && "rotate-180")}
              />
            </span>
          </button>
          <div className="section-detail-wrap" data-open={open || undefined}>
            <div className="section-detail" id={detailId}>
              {detail}
            </div>
          </div>
        </InfoCard>
      ) : framed ? (
        // No detail to disclose, but the children are bare content — keep the SAME
        // `.section-card` frame (no chevron), so a 0/1-item section never floats
        // card-less beside its carded siblings.
        <InfoCard className="section-card">{children}</InfoCard>
      ) : (
        children
      )}
    </section>
  );
}
