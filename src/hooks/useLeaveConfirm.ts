/**
 * Ask before leaving a half-done flow (creation, level-up): the one leave guard for
 * the classic wizards and the new screens.
 *
 * - A pristine screen (`dirty` false) never blocks: back simply leaves.
 * - A touched one blocks a route change and asks through the app's ConfirmDialog
 *   («Scarta» leaves, «Continua» stays), one prompt per blocked navigation.
 * - A refresh or tab close gets the browser's own prompt, touched only.
 * - The flow's own finish (Create, Confirm level) calls `finishing()` first, so its
 *   navigation never asks; `finishing(false)` when that finish fails.
 */
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useBlocker } from "react-router";

import { useConfirmStore } from "@/stores/confirmStore";

export function useLeaveConfirm(
  dirty: boolean,
  copy: { title: string; message: string }
): { finishing: (on?: boolean) => void } {
  const { t } = useTranslation();
  const finishingRef = useRef(false);
  const blocker = useBlocker(
    useCallback(
      ({
        currentLocation,
        nextLocation,
      }: {
        currentLocation: { pathname: string };
        nextLocation: { pathname: string };
      }) =>
        dirty &&
        !finishingRef.current &&
        currentLocation.pathname !== nextLocation.pathname,
      [dirty]
    )
  );
  // ONE confirm per blocked navigation: a re-render while blocked must never stack a
  // second dialog or orphan the first resolver.
  const confirmingRef = useRef(false);
  const { title, message } = copy;
  useEffect(() => {
    if (blocker.state !== "blocked" || confirmingRef.current) return;
    confirmingRef.current = true;
    let active = true;
    void useConfirmStore
      .getState()
      .confirm({
        title,
        message,
        confirmLabel: t("common.discard"),
        cancelLabel: t("common.continue"),
        // leaving throws the choices away: the danger action, never the bright one
        tone: "danger",
      })
      .then((ok) => {
        confirmingRef.current = false;
        if (!active) return;
        if (ok) blocker.proceed();
        else blocker.reset();
      });
    return () => {
      active = false;
    };
  }, [blocker, t, title, message]);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (finishingRef.current) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
  return {
    // `finishing(false)` re-arms the guard when the finish failed and the flow stays open.
    finishing: useCallback((on = true) => {
      finishingRef.current = on;
    }, []),
  };
}
