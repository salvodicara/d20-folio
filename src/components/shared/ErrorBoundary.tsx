import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Bug, TriangleAlert } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { reportCrash } from "@/features/report/crash-report";
import { cn } from "@/lib/utils";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional extra reset handler (e.g. navigate away) run when the user clicks "Try again". */
  onReset?: () => void;
  /**
   * Optional custom fallback. When provided, it REPLACES the default full
   * {@link ErrorFallback} — used for PER-SECTION fault isolation (Layer 4), where a
   * lone section that throws should degrade to a compact in-place notice (see
   * {@link SectionErrorFallback}) instead of taking the whole surface. Receives the
   * caught error + a reset that clears the boundary (re-mounts the subtree).
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export interface ErrorFallbackProps {
  error: Error;
  /** Runs when the user clicks the secondary action (reset / navigate home). */
  onReset: () => void;
  /** Label for the secondary action; defaults to "Try again". */
  resetLabel?: string;
  /**
   * `"fullscreen"` (default) fills the viewport — for the app-root boundary where
   * no shell survives. `"region"` fills the content area only — for the route
   * `errorElement` nested inside the persistent shell, so the nav stays usable.
   */
  variant?: "fullscreen" | "region";
}

/** Themed, bilingual fallback shown when a descendant render throws — the SAME
 *  runic hero every empty/404 surface wears (rule 3: one recipe, fixes
 *  propagate), in the danger hue, so even the crash nets carry the identity.
 *  The region variant sits transparently on the shell's candlelit backdrop
 *  (`on-art-scope`); only the root net — no shell art behind it — paints its
 *  own ground. `RunicEmptyState` is a pure presentational leaf, so the
 *  boundary cannot be crashed by its own fallback. */
export function ErrorFallback({
  error,
  onReset,
  resetLabel,
  variant = "fullscreen",
}: ErrorFallbackProps) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center p-6",
        variant === "region"
          ? "on-art-scope min-h-[60vh]"
          : "crash-field min-h-screen bg-bg-primary"
      )}
    >
      <RunicEmptyState
        glyph={TriangleAlert}
        color="var(--semantic-danger)"
        eyebrow={t("errorBoundary.eyebrow")}
        title={t("errorBoundary.title")}
        blurb={t("errorBoundary.message")}
        actions={
          <>
            <Button onClick={() => window.location.reload()}>
              {t("errorBoundary.reload")}
            </Button>
            <Button variant="secondary" onClick={onReset}>
              {resetLabel ?? t("errorBoundary.retry")}
            </Button>
            {/* The moment of failure is the moment of intent: open the global bug
                reporter PRE-FILLED with this crash (route · error · stack head), so
                reporting it is one tap. The dialog is mounted at the app root —
                outside both error nets — so it survives this very crash. */}
            <Button variant="ghost" onClick={() => reportCrash(error)}>
              <Icon as={Bug} size="sm" decorative />
              {t("errorBoundary.report")}
            </Button>
          </>
        }
        note={
          <details className="mx-auto max-w-md text-left">
            <summary className="cursor-pointer">{t("errorBoundary.details")}</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          </details>
        }
      />
    </div>
  );
}

/**
 * Catches render errors in its subtree and shows a recoverable fallback instead
 * of white-screening the whole SPA. Use at the app root and around the character
 * sheet (so a broken sheet doesn't kill the character list).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  private readonly handleReset = (): void => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback)
        return this.props.fallback(this.state.error, this.handleReset);
      return <ErrorFallback error={this.state.error} onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}

/**
 * Compact, in-place fallback for a SINGLE failed surface section (Layer 4 — per
 * section fault isolation). Used as the {@link ErrorBoundary} `fallback` so one
 * section throwing degrades to a quiet retryable notice while every sibling
 * section keeps rendering — the whole surface never white-screens. Reuses the
 * shared `role="alert"` + folio panel vocabulary (NOT a new component), at section
 * scale: a one-line message + a single "Try again" affordance, plus the global
 * crash reporter so a section failure is still reportable in one tap.
 */
export function SectionErrorFallback({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="folio-panel flex flex-col items-start gap-2 p-4 text-sm text-text-secondary"
    >
      <span className="flex items-center gap-2 text-text-primary">
        <Icon as={TriangleAlert} size="sm" decorative className="text-danger" />
        {t("errorBoundary.sectionMessage")}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={onReset}>
          {t("errorBoundary.retry")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => reportCrash(error)}>
          <Icon as={Bug} size="xs" decorative />
          {t("errorBoundary.report")}
        </Button>
      </div>
    </div>
  );
}
