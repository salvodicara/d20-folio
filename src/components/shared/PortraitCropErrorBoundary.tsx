/**
 * PortraitCropErrorBoundary
 *
 * A tiny, self-contained error boundary that wraps ONLY the `<Cropper>` in the
 * portrait crop modal. If react-easy-crop throws while rendering (e.g. a
 * degenerate image/crop produces NaN layout math), this boundary catches it
 * and shows an inline retry affordance — instead of letting the error bubble
 * to the app-root boundary and white-screen the whole SPA (data-loss-grade
 * failure: the only recovery was deleting the character).
 *
 * It is intentionally local: it owns no app state and renders its fallback
 * inside the modal's existing crop frame. `onRetry` lets the parent reset the
 * cropper (remount via a key bump) so the user can try again or cancel.
 */

import { Component, type ReactNode } from "react";

interface Props {
  /** Bumping this resets the boundary (re-attempt after a remount). */
  resetKey: number;
  /** Called when the user taps "Try again" — parent should remount the cropper. */
  onRetry: () => void;
  /** Localized strings (the boundary stays i18n-agnostic / pure). */
  messages: { error: string; retry: string };
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class PortraitCropErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidUpdate(prevProps: Props) {
    // When the parent bumps resetKey (retry), clear the error to re-render.
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  private handleRetry = () => {
    this.props.onRetry();
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-text-secondary">{this.props.messages.error}</p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:border-text-secondary/40"
          >
            {this.props.messages.retry}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
