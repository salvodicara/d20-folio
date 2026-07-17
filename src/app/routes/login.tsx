import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import { SiteFooter } from "@/app/shell/SiteFooter";
import { BrandMark } from "@/components/ui/brand-mark";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/authStore";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { signIn } from "@/lib/auth";

export function LoginPage() {
  const { t } = useTranslation();
  // The pre-auth splash carries the bare brand — and resets a stale title when a
  // signed-out user lands here from a titled page.
  useDocumentTitle();
  const { user, initialized, loading, error } = useAuthStore();

  // If already authenticated, redirect to home
  if (initialized && user) {
    return <Navigate to="/" replace />;
  }

  function handleSignIn() {
    void signIn();
  }

  return (
    <div className="login-shell relative flex min-h-screen items-center justify-center px-4">
      {/* #36 — the cinematic sign-in splash (login.webp) full-bleed behind the
          brand lockup, with a centre-weighted scrim so the card-less brand text
          stays readable while the painterly scene fills the frame at the edges.
          Deliberately STATIC (owner 2026-07-07): the old pointer-parallax drift
          was input-coupled decorative motion — off the calm/heirloom identity —
          so the scene now sits at its composed framing; life comes from the
          one-shot brand-intro reveal + the ambient loops below. */}
      <div className="login-splash" aria-hidden />
      {/* `brand-intro` orchestrates the one-shot welcome reveal: the hero mark
          strikes in, then the tagline / eyebrow / micro-tag / CTA rise + fade in
          a gentle stagger (folio.css). Transform+opacity only, reduced-motion
          safe (the global kill-switch lands every element at its rest state). */}
      <div className="brand-intro w-full max-w-sm text-center">
        {/* Illuminated brand lockup — gilt d20 emblem inside a thin concentric
            constellation ring studded with chromatic pigment dots (the signature
            Folio atmospheric motif that ties the hero to the domain palette),
            behind a soft gold halo, then the gold-leaf wordmark. All decorative +
            reduced-motion safe (rotation/twinkle gated behind [data-motion]). */}
        <div className="brand-hero">
          <span className="brand-hero-halo" aria-hidden />
          <BrandConstellation />
          <BrandMark variant="gilt" size="xl" />
          {/* OWN-27 — a slow gold gleam sweeps across the die's facets (struck gold
              catching candlelight). Clipped to the d20 hexagon, blended to brighten
              the gold; gated under data-motion=auto, frozen under reduced motion. */}
          <span className="brand-hero-gleam" aria-hidden />
        </div>

        {/* Tagline — the mystical headline + emotional hook, in the display
            italic voice (the first line you read under the mark). */}
        <p className="on-art mt-5 font-display text-xl italic leading-tight text-text-primary">
          {t("app.tagline")}
        </p>

        {/* Eyebrow — the full promise: what the app frees you to do (build your
            hero · master every rule effortlessly · stay in the story). The
            benefit-led value line, warm and readable — never a tiny kicker. */}
        <p className="on-art mx-auto mt-3 max-w-xs text-sm leading-relaxed text-text-secondary">
          {t("app.eyebrow")}
        </p>

        {/* Micro-tag — the quiet, concrete differentiator in the engraved mono
            kicker voice (reuses the .brand-eyebrow primitive, now placed below). */}
        <p className="brand-eyebrow on-art mt-5">{t("app.microTag")}</p>

        {/* Sign-in — the flagship first-impression CTA uses the branded
            pressed-brass `.btn-google` (the welcome.html hero button), not a
            generic shadcn control under a plain card. The white Google chip sits
            in the `.g` token; the hero + CTA read as one composition. */}
        <div className="mt-8 flex flex-col items-center">
          <button
            type="button"
            className="btn-google"
            onClick={handleSignIn}
            disabled={loading}
          >
            {loading ? (
              <>
                <Spinner size="sm" onBrass label={t("auth.signingIn")} />
                {t("auth.signingIn")}
              </>
            ) : (
              <>
                <span className="g" aria-hidden>
                  <GoogleIcon />
                </span>
                {t("auth.signIn")}
              </>
            )}
          </button>

          {error && (
            // Beginner-friendly error: announce it (role="alert") and offer a
            // clear, explicit retry rather than relying on the user to re-press
            // the primary button (C9).
            <div role="alert" className="mt-4 flex flex-col items-center gap-2">
              <p className="text-center text-sm text-danger">{t("auth.error")}</p>
              <Button
                variant="ghost"
                size="sm"
                className="on-art"
                onClick={handleSignIn}
                disabled={loading}
              >
                {t("auth.tryAgain")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* The same quiet colophon every signed-in page carries — pre-auth users
          must be able to reach the Legal & attribution page (the SRD/CC-BY
          notices), so the ONE shared footer rides the bottom of the splash. */}
      <div className="on-art-scope absolute inset-x-0 bottom-0">
        <SiteFooter />
      </div>
    </div>
  );
}

/**
 * Decorative constellation ring behind the gilt hero mark — a faint gold orbit
 * with a few chromatic pigment dots (lapis / vermilion / verdigris / amethyst,
 * the domain-palette pigments) positioned on it. Reusable Folio atmosphere; it
 * slow-rotates under data-motion=auto and freezes under reduced-motion (folio.css).
 */
function BrandConstellation() {
  return (
    <span className="brand-constellation" aria-hidden>
      <svg viewBox="0 0 200 200" width="200" height="200">
        <circle
          cx="100"
          cy="100"
          r="86"
          fill="none"
          stroke="var(--accent-primary)"
          strokeWidth="1"
          strokeDasharray="2 7"
          opacity="0.5"
        />
        {/* OWN-27 — recoloured in line with the chrome: gold-leaf pigment dots
            with two warm EMBER specks (gold composited toward vermilion) that echo
            the painterly firelit splash behind, replacing the old clashing
            lapis/vermilion/verdigris/amethyst quartet. */}
        <circle cx="100" cy="14" r="3" fill="var(--gold-leaf-100)" />
        <circle
          cx="174"
          cy="74"
          r="2.6"
          fill="color-mix(in oklab, var(--gold-leaf-300) 52%, var(--vermilion-500))"
        />
        <circle cx="150" cy="166" r="2.4" fill="var(--gold-leaf-300)" />
        <circle
          cx="38"
          cy="150"
          r="2.6"
          fill="color-mix(in oklab, var(--gold-leaf-300) 42%, var(--vermilion-700))"
        />
        <circle cx="26" cy="62" r="2.2" fill="var(--accent-primary-bright)" />
      </svg>
    </span>
  );
}

function GoogleIcon() {
  return (
    <svg
      className="h-[14px] w-[14px]"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
