/**
 * SectionPanel — the ONE hub-section chrome for the campaign MANAGE band.
 *
 * Replaces the retired all-or-nothing `CollapsibleSection` (which folded the WHOLE
 * section, so a folded Treasury showed NOTHING — bug C). The model is now:
 *
 *   • a FIXED panel — the key at-a-glance signal + the primary actions, ALWAYS
 *     rendered (the `children`); never hidden by a fold;
 *   • an optional DETAIL slot — the bulky secondary list (a ledger, a session list,
 *     older chapters, the note board) — the ONLY thing that collapses. It expands
 *     INLINE in place through the SINGLE `grid-template-rows: 0fr → 1fr` reveal
 *     (`.section-detail-wrap` / `.section-detail`, the app's one height recipe) —
 *     NOT a ResizeObserver `AutoAnimateHeight`. So a section with its own nested
 *     reveal (Sessions' per-row accordion) has ONE animator per gesture instead of
 *     two stacked height animators fighting (bug B — the sticky/janky feel).
 *
 * The fixed panel, the disclosure, and the expandable detail all live INSIDE ONE
 * `.info-card` surface (`.section-card`) — owner: the gilt-knob chevron must sit ON
 * the card, never float in the gap BELOW it. The chevron docks at the card's BOTTOM
 * EDGE (a hairline divider above it, inside the surface) and the detail reveals IN
 * PLACE inside the SAME card (the card grows taller) through the single grid-rows
 * reveal — NOT a separate strip floating beneath the card. A section that has NO
 * `detail` (a static header) instead renders its `children` directly, so it keeps
 * whatever surface they bring (Chronicle's book-spread, DM Tools' card grid) — only
 * the collapsible sections are wrapped in the one section card.
 *
 * The disclosure is a CLEAN, compact CHEVRON expander docked centred at the card
 * bottom (a hairline divider above it) — NOT on the header (B5/D4 — owner: a toggle
 * on the header "is NOT intuitive") and NO LONGER a worded full-width footer pill
 * (owner: those were "not even readable on light/dark theme" — "just an intuitive
 * chevron in the box and expand that"). The header is a static {@link SectionHeader}
 * rubric; its `meta` count/total badge stays visible whether the detail is open or
 * closed (folding never hides signal) and already carries the count, so the chevron
 * shows NO visible label. A down-chevron invites expand; it rotates up when open.
 * The per-section worded `showLabel`/`hideLabel` (kept for i18n) ride as the button's
 * `aria-label` so assistive tech still hears the full intent + count. The control
 * carries `aria-expanded` / `aria-controls` for the detail region. When no `detail`
 * is supplied (an empty ledger, a one-note board) the chevron is absent — an honest
 * static header over the fixed panel.
 *
 * STICKY per campaign (localStorage): the detail's open/closed choice persists per
 * `campaignId × sectionId`, so a folded ledger stays folded on the next visit to
 * THIS campaign without leaking the preference to another. Defaults CLOSED so the
 * panels stay SHORT and the whole campaign reads at a glance (especially the
 * single-column mobile stack); the detail grows on intent.
 *
 * Party is NEVER a SectionPanel (it's the always-open PLAY band); only the MANAGE
 * sections ride this.
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

  return (
    <section aria-labelledby={headId} className={cn("section-panel", className)}>
      <SectionHeader as="h2" tight id={headId} title={title} count={count} meta={meta} />
      {detail ? (
        // ONE card encloses the fixed panel + the disclosure + the expandable detail
        // (owner: the gilt-knob chevron sits ON the card, never floats below it). The
        // chevron docks at the card's BOTTOM EDGE; the detail reveals IN PLACE inside
        // the SAME card (the card grows taller) via the single grid-rows reveal. The
        // canonical `.info-card` surface comes from the shared <InfoCard>.
        <InfoCard className="section-card">
          {children}
          {/* The chevron disclosure (B5/D4): a compact, centred, ≥44px tap-target
              chevron docked at the card's bottom edge, above the detail it reveals — no
              visible label (the header meta badge carries the count); the worded
              showLabel/hideLabel ride as the aria-label. */}
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
