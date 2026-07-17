/**
 * `withTimeout` — reject a promise if it hasn't settled within `ms`.
 *
 * The shared bound behind two "the SDK can silently hang for minutes" seams:
 *  - the portrait export read (`storage.ts`), where the Storage SDK retries a
 *    network-dead read against a ~2-min deadline;
 *  - the campaign server-confirm read (`campaign-io.ts`), where a wedged Firestore
 *    local layer (after a mid-session "Clear site data") can leave `getDocsFromServer`
 *    hanging so the list would spin forever instead of surfacing a recoverable error.
 *
 * The timer never outlives the promise (cleared on settle either way). The rejection
 * carries a stable `TimeoutError` name so a caller can branch on it.
 */
export class TimeoutError extends Error {
  constructor(ms: number, label?: string) {
    super(`${label ?? "operation"} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label?: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms, label)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    );
  });
}
