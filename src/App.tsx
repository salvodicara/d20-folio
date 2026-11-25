import { lazy, Suspense, useEffect } from "react";
import { AppRouter } from "./app/router";
import { initAuthListener } from "./lib/auth";
import { PWABanner } from "./components/shared/PWABanner";
import { ShapeGateScreen } from "./app/ShapeGateScreen";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { ReportDialog } from "./features/report/ReportDialog";

// #1320 — lazy: it reads the character store and the Apply path, which must stay off
// the eager entry (the bundle-budget guard).
const RescueBanner = lazy(() =>
  import("./app/RescueBanner").then((m) => ({ default: m.RescueBanner }))
);

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
        {/* #1320 — a newer stored shape: writes are fenced, ask for a reload. */}
        <ShapeGateScreen />
        {/* #1320 — after the reload: apply or discard the edits kept on this device. */}
        <Suspense fallback={null}>
          <RescueBanner />
        </Suspense>
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
