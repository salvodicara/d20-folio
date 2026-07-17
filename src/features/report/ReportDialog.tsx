/**
 * ReportDialog — the in-app bug / feature reporter (OWN-37).
 *
 * Reachable from "Ask the Folio" (⌘K → "bug" / "report" / "feature" / "segnala"),
 * the account menu ("Report a bug"), and the crash screens ("Report this
 * problem", pre-filled via `crash-report.ts`) — the entry-point list lives in
 * docs/BUG_REPORTING.md. It puts the user ON RAILS: pick a Type and Severity from carved
 * segmented controls, confirm the auto-detected Screen (overridable), write a
 * short Title + Description, optionally keep the auto-captured screenshot, and
 * send. The report writes to Firestore `/bug_reports/{id}`; a Cloud Function then
 * opens a GitHub issue and writes the number back, which we surface as
 * "opened as #NN".
 *
 * Reuses the folio chrome — Dialog/Segmented/Field/Input/Textarea/Button/Icon —
 * so it sits natively in the app; the owner does the final visual polish. Every
 * user-visible string is i18n (`report.*`), and the "what we'll attach"
 * disclosure makes the captured debug data transparent.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bug,
  Sparkles,
  Palette,
  Database,
  Gauge,
  CircleHelp,
  Check,
  ExternalLink,
  Trash2,
  ChevronDown,
  WifiOff,
  CircleAlert,
  ImageOff,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogFooter,
  Segmented,
  Field,
  Input,
  Textarea,
  Button,
  Icon,
} from "@/components/ui";
import { Select } from "@/components/shared/Select";
import { useUIStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { useLocale } from "@/hooks/useLocale";
import { collectDebugContext } from "./collect-debug-context";
import { detectScreen, allScreens } from "./screens";
import { takePendingPrefill, takePendingScreenshot } from "./open-report";
import { submitReport, subscribeToReport } from "./report-io";
import type { Screenshot } from "./capture-screenshot";
import {
  MAX_DESCRIPTION,
  MAX_TITLE,
  REPORT_SEVERITIES,
  REPORT_TYPES,
  type ReportPrefill,
  type ReportSeverity,
  type ReportType,
} from "./types";

type Phase = "form" | "submitting" | "sent" | "error";

/** Type options paired with the glyph each concept uses elsewhere. */
const TYPE_ICONS: Record<ReportType, typeof Bug> = {
  bug: Bug,
  feature: Sparkles,
  visual: Palette,
  data: Database,
  performance: Gauge,
  other: CircleHelp,
};

export function ReportDialog() {
  const open = useUIStore((s) => s.reportOpen);
  const setOpen = useUIStore((s) => s.setReportOpen);
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open ? (
        <DialogContent
          size="lg"
          rubric={t("report.rubric")}
          title={t("report.title")}
          description={t("report.description")}
          closeLabel={t("common.close")}
        >
          {/* Child of DialogContent → only mounts while open, so the screen
              capture + debug context are claimed exactly once per open. */}
          <ReportBody onClose={() => setOpen(false)} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function ReportBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const uid = useAuthStore((s) => s.user?.uid);

  // Claim the screenshot + prefill parked by openReport() exactly once, via lazy
  // state initializers (run during the first render, NOT in an effect — so no
  // cascading re-render). This body only mounts once per open, so the single
  // claim is correct. If the reporter was opened WITHOUT pre-capture (a direct
  // store flip), there's simply no screenshot — the text report is still complete.
  const [screenshot] = useState<Screenshot | null>(() => takePendingScreenshot());
  const [keepScreenshot, setKeepScreenshot] = useState(true);
  const [prefill] = useState<ReportPrefill | null>(() => takePendingPrefill());

  // One-shot pathname read at open time (NOT useLocation): the dialog is mounted
  // at the app root — OUTSIDE the router — so the crash screens can open it even
  // when the route tree itself has thrown.
  const [pathname] = useState(
    () => (typeof window !== "undefined" && window.location.pathname) || "/"
  );

  const screens = useMemo(() => allScreens(), []);
  const detected = useMemo(() => detectScreen(pathname), [pathname]);

  const [type, setType] = useState<ReportType>(prefill?.type ?? "bug");
  const [severity, setSeverity] = useState<ReportSeverity>(prefill?.severity ?? "medium");
  const [screen, setScreen] = useState<string>(detected.id);
  const [title, setTitle] = useState(prefill?.title ?? "");
  // Has the required Summary field been left (blurred) yet? The "required" error
  // only shows AFTER the user touches + leaves it empty — a pristine field on open
  // shows its help text, not an alarming red error (the disabled Send button is the
  // affordance while it's empty).
  const [titleTouched, setTitleTouched] = useState(false);
  const [description, setDescription] = useState(prefill?.description ?? "");
  const [showAttach, setShowAttach] = useState(false);

  const [phase, setPhase] = useState<Phase>("form");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [issueNumber, setIssueNumber] = useState<number | null>(null);
  const [issueUrl, setIssueUrl] = useState<string | null>(null);

  // Live online status (offline → optimistic "queued" copy + a banner).
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // The debug context, captured once for the "what we'll attach" disclosure (the
  // SAME data the IO layer captures at submit, so the preview is honest).
  const debug = useMemo(() => collectDebugContext(), []);

  // Subscribe to the report doc after a successful send so "Sent" upgrades to
  // "opened as #NN" once the Cloud Function creates the GitHub issue.
  const unsubRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      unsubRef.current?.();
    },
    []
  );

  const titleError = title.trim().length === 0;
  // Only surface the required-field error once the user has touched + left it empty.
  const showTitleError = titleError && titleTouched;
  const canSubmit = !titleError && phase !== "submitting";

  const typeOptions = useMemo(
    () =>
      REPORT_TYPES.map((value) => ({
        value,
        label: (
          <span className="inline-flex items-center gap-1.5">
            <Icon as={TYPE_ICONS[value]} size="sm" decorative />
            {t(`report.types.${value}`)}
          </span>
        ),
        ariaLabel: t(`report.types.${value}`),
      })),
    [t]
  );

  const severityOptions = useMemo(
    () =>
      REPORT_SEVERITIES.map((value) => ({
        value,
        label: t(`report.severities.${value}`),
      })),
    [t]
  );

  async function handleSubmit() {
    if (!canSubmit) return;
    if (!uid) {
      setErrorMsg(t("report.errorNoUser"));
      setPhase("error");
      return;
    }
    setPhase("submitting");
    setErrorMsg(null);
    try {
      const { reportId } = await submitReport(
        {
          type,
          screen,
          severity,
          title: title.trim(),
          description: description.trim(),
        },
        uid,
        locale,
        keepScreenshot ? screenshot?.blob : null
      );
      setPhase("sent");
      // Watch for the function's write-back (the issue number). Best-effort —
      // offline, this simply never fires and the user keeps the "queued" copy.
      unsubRef.current = subscribeToReport(reportId, (p) => {
        if (typeof p.issueNumber === "number") setIssueNumber(p.issueNumber);
        if (p.issueUrl) setIssueUrl(p.issueUrl);
      });
    } catch (err) {
      // Trim a trailing period: the message interpolates into a sentence that
      // adds its own ("…: Missing permissions.. Please try again" read broken).
      setErrorMsg(
        err instanceof Error ? err.message.replace(/\.+$/, "") : t("common.unknownError")
      );
      setPhase("error");
    }
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (phase === "sent") {
    return (
      <>
        <DialogBody>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Icon as={Check} size="lg" decorative className="text-success" />
            <p className="font-display text-lg">
              {online ? t("report.sentTitle") : t("report.queuedTitle")}
            </p>
            <p className="text-sm text-text-secondary">
              {issueNumber !== null
                ? t("report.openedAs", { number: issueNumber })
                : online
                  ? t("report.sentBody")
                  : t("report.queuedBody")}
            </p>
            {issueUrl ? (
              <a
                href={issueUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-sm text-accent underline"
              >
                <Icon as={ExternalLink} size="sm" decorative />
                {t("report.viewIssue")}
              </a>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            {t("common.done")}
          </Button>
        </DialogFooter>
      </>
    );
  }

  // ── Form (and error) state ───────────────────────────────────────────────────
  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        {!online ? (
          <p className="report-offline flex items-center gap-2 rounded-md border border-border-subtle px-3 py-2 text-sm text-text-secondary">
            <Icon as={WifiOff} size="sm" decorative />
            {t("report.offlineNote")}
          </p>
        ) : null}

        {/* Type — segmented carved control, on rails. */}
        <Field label={t("report.fieldType")}>
          {() => (
            <Segmented<ReportType>
              options={typeOptions}
              value={type}
              onChange={setType}
              aria-label={t("report.fieldType")}
              className="report-type-seg flex-wrap"
            />
          )}
        </Field>

        {/* Screen + Severity — two columns from sm up. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("report.fieldScreen")} help={t("report.fieldScreenHelp")}>
            {({ id, "aria-describedby": describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={screen}
                onChange={(e) => setScreen(e.target.value)}
              >
                {screens.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(s.labelKey)}
                    {s.id === detected.id ? ` · ${t("report.detected")}` : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t("report.fieldSeverity")}>
            {() => (
              <Segmented<ReportSeverity>
                options={severityOptions}
                value={severity}
                onChange={setSeverity}
                aria-label={t("report.fieldSeverity")}
              />
            )}
          </Field>
        </div>

        {/* Title — required. */}
        <Field
          label={t("report.fieldTitle")}
          error={showTitleError ? t("report.titleRequired") : undefined}
          help={!showTitleError ? t("report.fieldTitleHelp") : undefined}
        >
          {({ id, "aria-describedby": describedBy, "aria-invalid": invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              error={invalid}
              value={title}
              maxLength={MAX_TITLE}
              placeholder={t("report.fieldTitlePlaceholder")}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitleTouched(true)}
            />
          )}
        </Field>

        {/* Description — guided microcopy. */}
        <Field
          label={t("report.fieldDescription")}
          help={t("report.fieldDescriptionHelp")}
        >
          {({ id, "aria-describedby": describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              rows={5}
              value={description}
              maxLength={MAX_DESCRIPTION}
              placeholder={t("report.fieldDescriptionPlaceholder")}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>

        {/* Screenshot — auto-captured thumbnail with a keep/remove toggle. */}
        <div className="report-shot flex flex-col gap-2">
          <span className="field-label">{t("report.fieldScreenshot")}</span>
          {screenshot ? (
            keepScreenshot ? (
              // min-h reserves the row height so the thumbnail decoding doesn't
              // shove the controls down (#59 F25 — minor CLS on decode).
              <div className="flex min-h-32 items-start gap-3">
                <img
                  src={screenshot.dataUrl}
                  alt={t("report.screenshotAlt")}
                  decoding="async"
                  className="report-shot-thumb max-h-32 rounded-md border border-border-subtle"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setKeepScreenshot(false)}
                >
                  <Icon as={Trash2} size="sm" decorative />
                  {t("common.remove")}
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => setKeepScreenshot(true)}
              >
                {t("report.keepScreenshot")}
              </Button>
            )
          ) : (
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <Icon as={ImageOff} size="sm" decorative />
              {t("report.noScreenshot")}
            </p>
          )}
        </div>

        {/* "What we'll attach" — transparency disclosure of the debug context. */}
        <div className="report-attach">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm text-text-secondary underline"
            aria-expanded={showAttach}
            onClick={() => setShowAttach((v) => !v)}
          >
            <Icon
              as={ChevronDown}
              size="sm"
              decorative
              className={
                showAttach ? "rotate-180 transition-transform" : "transition-transform"
              }
            />
            {t("report.attachDisclosure")}
          </button>
          {showAttach ? (
            <dl className="report-attach-list mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-text-secondary">
              <dt>{t("report.attach.screen")}</dt>
              <dd className="font-mono">{debug.pathname}</dd>
              <dt>{t("report.attach.version")}</dt>
              <dd className="font-mono">
                {debug.appVersion} · {debug.gitSha}
              </dd>
              <dt>{t("report.attach.browser")}</dt>
              <dd className="truncate font-mono">{debug.userAgent}</dd>
              <dt>{t("report.attach.viewport")}</dt>
              <dd className="font-mono">{debug.viewport}</dd>
              <dt>{t("report.attach.themeLocale")}</dt>
              <dd className="font-mono">
                {debug.theme} · {debug.locale}
              </dd>
              <dt>{t("report.attach.recentErrors")}</dt>
              <dd className="font-mono">{debug.recentErrors.length}</dd>
            </dl>
          ) : null}
        </div>

        {phase === "error" && errorMsg ? (
          <p
            role="alert"
            className="report-error flex items-center gap-2 rounded-md border border-danger px-3 py-2 text-sm text-danger"
          >
            <Icon as={CircleAlert} size="sm" decorative />
            {t("report.submitError", { message: errorMsg })}
          </p>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={phase === "submitting"}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          loading={phase === "submitting"}
        >
          {t("report.submit")}
        </Button>
      </DialogFooter>
    </>
  );
}
