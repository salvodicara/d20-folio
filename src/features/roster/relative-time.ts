/**
 * Bilingual relative-time formatting for the roster (H2).
 *
 * A roster is scanned by recency, so "2 days ago" / "2 giorni fa" reads faster
 * than an absolute "2 Jun 2026". Built on the platform `Intl.RelativeTimeFormat`
 * (locale-aware out of the box) — no new dependency.
 *
 * NB: this lives in the feature layer (not `src/lib`, which is immutable) and
 * takes `now` as an injectable parameter. Render-path callers MUST pass a stable
 * `now` (capture it once per mount: `const [now] = useState(() => Date.now())`)
 * so render stays pure — the `Date.now()` default exists ONLY for tests and
 * non-render call sites; relying on it in render is a React-rules violation the
 * linter can't see through the default param.
 */

interface Division {
  readonly amount: number;
  readonly unit: Intl.RelativeTimeFormatUnit;
}

const DIVISIONS: readonly Division[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

/** Format `date` relative to `now` in the given locale ("2 days ago" / "2 giorni fa"). */
export function formatRelativeTime(
  date: Date,
  locale: string,
  now: number = Date.now()
): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  let duration = (date.getTime() - now) / 1000; // seconds; negative = in the past
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return rtf.format(Math.round(duration), "year");
}

/** True when `date` is within the last day — drives the `.ch-played.now` cue. */
export function isRecent(
  date: Date,
  now: number = Date.now(),
  withinMs: number = 24 * 60 * 60 * 1000
): boolean {
  const delta = now - date.getTime();
  return delta >= 0 && delta < withinMs;
}
