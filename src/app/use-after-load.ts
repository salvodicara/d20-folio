/**
 * True once the page has loaded and the browser had an idle moment: a background job
 * (the fight producer, which brings the rules engine) waits for it, so on a slow phone
 * the screen's own code and data download first. Measured 2026-11-12 on a mid-range
 * profile: started with the frame, the producer's download queued the character
 * list's data behind it.
 */
import { useEffect, useState } from "react";

/** The longest an idle moment is waited for once the page has loaded. */
const IDLE_TIMEOUT_MS = 2000;

export function useAfterLoad(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelIdle = () => {};
    const whenIdle = () => {
      if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(() => setReady(true), {
          timeout: IDLE_TIMEOUT_MS,
        });
        cancelIdle = () => window.cancelIdleCallback(id);
      } else {
        const id = window.setTimeout(() => setReady(true), 0);
        cancelIdle = () => window.clearTimeout(id);
      }
    };
    if (document.readyState === "complete") {
      whenIdle();
      return () => cancelIdle();
    }
    window.addEventListener("load", whenIdle, { once: true });
    return () => {
      window.removeEventListener("load", whenIdle);
      cancelIdle();
    };
  }, []);
  return ready;
}
