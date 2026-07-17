import { useEffect } from "react";
import { AppRouter } from "./app/router";
import { initAuthListener } from "./lib/auth";
import { PWABanner } from "./components/shared/PWABanner";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { ReportDialog } from "./features/report/ReportDialog";

export function App() {
  useEffect(() => {
    const unsubscribe = initAuthListener();
    return unsubscribe;
  }, []);

  return (
    <>
      <ErrorBoundary>
        <AppRouter />
        <PWABanner />
      </ErrorBoundary>
      {/* The global bug / feature reporter (OWN-37). Store-driven (`reportOpen`)
          and router-free, mounted as a SIBLING of the root error net so EVERY
          entry point — the ⌘K palette, the account menu, and the crash screens
          themselves (fullscreen + region) — opens the same dialog, even while
          the route tree is down. */}
      <ReportDialog />
    </>
  );
}
