import { useEffect, useRef, useState } from "react";
import { OperationController, type OperationState } from "@/lib/shared/controller";
import { equal } from "@/lib/shared/model";
import type { Envelope } from "@/lib/shared/model";

import type { SessionController } from "@/lib/identity/session";
export function useLibraryOperation<
  O extends Envelope,
  R extends { operation: O; revision: number },
>(
  repository: {
    commit(operation: O, check?: () => void): Promise<R>;
    reconcile(operation: O): Promise<R | null>;
  },
  session: SessionController,
  key: string,
  onAck: (operation: O) => void | Promise<void>
) {
  const storageKey = "folio-library-operation:" + (session.scope().uid ?? "") + ":" + key;
  const [state, setState] = useState<OperationState<O, R> | null>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as {
        envelope: O;
        invalidated: boolean;
      } | null;
      return saved?.envelope
        ? {
            envelope: saved.envelope,
            status:
              saved.invalidated || !equal(saved.envelope.scope, session.scope())
                ? "invalidated"
                : "unknown",
          }
        : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState(false),
    [preparing, setPreparing] = useState(false);
  const controller = useRef<OperationController<O, R> | null>(null);
  const detach = useRef(() => {}),
    live = useRef(true),
    ack = useRef(onAck);

  const currentState = useRef(state);
  useEffect(() => {
    ack.current = onAck;
    currentState.current = state;
  }, [onAck, state]);
  useEffect(() => {
    live.current = true;
    const untrack = session.track(() => {
      if (!live.current) return;
      const envelope = currentState.current?.envelope;
      if (envelope)
        try {
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({ envelope, invalidated: true })
          );
        } catch {
          setError(true);
        }
      controller.current?.invalidate();
      setState(null);
      setPreparing(false);
    });
    return () => {
      live.current = false;
      detach.current();
      controller.current?.invalidate();
      untrack();
    };
  }, [session, storageKey]);
  const dispatch = async (envelope: O, retry: boolean) => {
    if (controller.current) {
      await controller.current.retry();
      return;
    }
    const c = new OperationController(envelope, repository);
    try {
      const original = JSON.stringify({ envelope, invalidated: false });
      sessionStorage.setItem(storageKey, original);
      if (sessionStorage.getItem(storageKey) !== original) throw new Error("storage");
    } catch {
      setError(true);
      return;
    }
    controller.current = c;
    detach.current = c.subscribe(() => {
      if (!live.current) return;
      setState(c.state);
      if (c.state.status === "acknowledged") {
        const check = session.ticket();
        void Promise.resolve()
          .then(async () => {
            check();
            if (!live.current) return;
            await ack.current(c.state.envelope);
            check();
            const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as {
              envelope?: unknown;
              invalidated?: boolean;
            } | null;
            if (saved && !saved.invalidated && equal(saved.envelope, c.state.envelope))
              sessionStorage.removeItem(storageKey);
          })
          .catch(() => {
            if (live.current) setError(true);
          });
      } else if (c.state.status === "invalidated") {
        try {
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({ envelope, invalidated: true })
          );
        } catch {
          setError(true);
        }
      }
    });
    setState(c.state);
    await (retry ? c.retry() : c.submit());
  };
  return {
    state,
    error,
    preparing,
    busy: preparing || state?.status === "pending" || state?.status === "unknown",
    retry: () => (state ? dispatch(state.envelope, true) : Promise.resolve()),
    reviewSettled: async (): Promise<boolean> => {
      if (!state) return true;
      if (preparing || !["conflict", "rejected", "invalidated"].includes(state.status))
        return false;
      const check = session.ticket();
      setPreparing(true);
      try {
        if (state.status === "invalidated") {
          const receipt = await repository.reconcile(state.envelope);
          check();
          if (!live.current) return false;
          if (receipt) {
            await ack.current(state.envelope);
            check();
            const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as {
              envelope?: unknown;
            } | null;
            if (saved && equal(saved.envelope, state.envelope)) {
              sessionStorage.removeItem(storageKey);
              if (sessionStorage.getItem(storageKey) !== null) throw Error("storage");
            }
            detach.current();
            controller.current = null;
            currentState.current = null;
            setState(null);
            return false;
          }
        }
        check();
        const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as {
          envelope?: unknown;
        } | null;
        if (saved && !equal(saved.envelope, state.envelope))
          throw Error("newer-operation");
        if (saved) sessionStorage.removeItem(storageKey);
        if (sessionStorage.getItem(storageKey) !== null) throw Error("storage");
        detach.current();
        controller.current?.invalidate();
        controller.current = null;
        currentState.current = null;
        setState(null);
        setError(false);
        return true;
      } catch {
        if (live.current) setError(true);
        return false;
      } finally {
        if (live.current) setPreparing(false);
      }
    },
    run: async (make: () => O | null | Promise<O | null>) => {
      if (preparing || state?.status === "pending" || state?.status === "unknown") return;
      const check = session.ticket();
      setPreparing(true);
      setError(false);
      try {
        const envelope = await make();
        check();
        if (!live.current) return;
        detach.current();
        controller.current = null;
        setState(null);
        if (envelope) await dispatch(envelope, false);
      } catch {
        if (live.current) setError(true);
      } finally {
        if (live.current) setPreparing(false);
      }
    },
  };
}
