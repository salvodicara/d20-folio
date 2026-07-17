/**
 * RouteErrorBoundary — the React Router `errorElement` for the data router.
 *
 * A render error thrown inside a route is caught by React Router itself (not by a
 * React `<ErrorBoundary>` wrapping the `<RouterProvider>`), so without an
 * `errorElement` the router falls back to its bare default screen — the white
 * "Unexpected Application Error!" page the owner hit when a malformed character
 * doc crashed the roster. This wires a recoverable, folio-themed fallback into
 * the route tree so that class of crash NEVER white-screens the app again.
 *
 * It reuses the SAME `<ErrorFallback>` recipe as the app-root class boundary (one
 * fallback UI, so a fix to either propagates to both). Two placements:
 *   - root (`variant="fullscreen"`): the ultimate net (login / pre-shell errors);
 *   - nested inside `<AppShell>` (`variant="region"`): preserves the persistent
 *     nav so the user can simply walk away from the broken surface.
 */
import { useRouteError, isRouteErrorResponse, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ErrorFallback } from "./ErrorBoundary";

/** Coerce React Router's `unknown` route error into a displayable `Error`. */
function toError(routeError: unknown): Error {
  if (routeError instanceof Error) return routeError;
  if (isRouteErrorResponse(routeError)) {
    return new Error(`${routeError.status} ${routeError.statusText}`);
  }
  if (typeof routeError === "string") return new Error(routeError);
  return new Error("Unknown error");
}

export function RouteErrorBoundary({
  variant = "region",
}: {
  variant?: "fullscreen" | "region";
}) {
  const routeError = useRouteError();
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <ErrorFallback
      error={toError(routeError)}
      variant={variant}
      resetLabel={t("errorBoundary.backHome")}
      onReset={() => void navigate("/characters")}
    />
  );
}
