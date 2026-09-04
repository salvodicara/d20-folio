/**
 * The play screen's tooltip (UI spec rule 40) and its explain-on-demand trigger (component 8).
 *
 * Rule 40 asks for one shape everywhere: after about 450 ms of hover — or immediately on
 * keyboard focus — a small panel with the control's label, its hotkey chip, and one plain
 * sentence, never covering the trigger. That is exactly what Radix's tooltip already does, so
 * this is a body, a delay and a class, not a second tooltip engine.
 *
 * `PlayExplain` is the reference explain (component 8): a term with a dotted gold underline whose
 * panel answers "what is this?" — CR, AC, initiative, the economy signs, the verdicts. Unexplained
 * jargon on this screen is a defect, so a number with an abbreviation beside it gets one of these
 * rather than being left to be guessed.
 */
import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/tooltip";

/** Rule 40's "about 450 ms". */
export const PLAY_TIP_DELAY_MS = 450;

export interface PlayTipProps {
  readonly label: string;
  /** One plain sentence. Omitted only when the label IS the whole explanation. */
  readonly hint?: string;
  /** The keyboard shortcut, as its chip — never printed inside the button (rule 39). */
  readonly hotkey?: string;
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly children: ReactNode;
}

export function PlayTip({ label, hint, hotkey, side = "top", children }: PlayTipProps) {
  return (
    <Tooltip
      side={side}
      delayDuration={PLAY_TIP_DELAY_MS}
      content={
        <span className="pl-tip">
          <b>
            {label}
            {hotkey ? <kbd>{hotkey}</kbd> : null}
          </b>
          {hint ? <span>{hint}</span> : null}
        </span>
      }
    >
      {children}
    </Tooltip>
  );
}

export interface PlayExplainProps {
  /** The word or abbreviation as it is printed on the screen. */
  readonly term: string;
  readonly label: string;
  readonly hint: string;
  readonly side?: "top" | "right" | "bottom" | "left";
}

export function PlayExplain({ term, label, hint, side = "top" }: PlayExplainProps) {
  return (
    <PlayTip label={label} hint={hint} side={side}>
      <abbr className="pl-explain" tabIndex={0}>
        {term}
      </abbr>
    </PlayTip>
  );
}
