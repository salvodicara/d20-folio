import { Navigate, Outlet, useLocation } from "react-router";
import { Ban } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useTranslation } from "react-i18next";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { FolioLoader } from "@/components/shared/FolioLoader";

/**
 * Auth guard that protects routes requiring authentication.
 * Redirects to /login if user is not authenticated.
 * Shows blocked screen if user is blocked.
 * Shows loading spinner while auth state is initializing.
 *
 * In dev mode with VITE_DEV_BYPASS_AUTH=true, always passes through.
 */
export function AuthGuard() {
  const { t } = useTranslation();
  const { user, initialized, isBlocked, loading } = useAuthStore();
  const location = useLocation();

  // Dev bypass — skip all auth checks
  if (DEV_BYPASS_AUTH) {
    return <Outlet />;
  }

  // Wait for auth state to resolve. The SAME gilt d20 as the boot splash, shown
  // immediately (delay 0) so the cold-load handoff is one continuous die — no
  // second/different spinner swapping in over it (fixes the "spinner over the dice").
  if (!initialized || loading) {
    return <FolioLoader variant="fullscreen" delay={0} label={t("common.loading")} />;
  }

  // Blocked user
  if (isBlocked) {
    return <BlockedScreen />;
  }

  // Not authenticated — redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Authenticated — render child routes
  return <Outlet />;
}

/**
 * Screen shown to blocked users.
 */
function BlockedScreen() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-6">
      <RunicEmptyState
        glyph={Ban}
        color="var(--color-danger)"
        title={t("auth.blockedTitle")}
        blurb={t("auth.blocked")}
      />
    </div>
  );
}
