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
    validateRecovered?(operation: O): void;
  },
  session: SessionController,
  key: string,
  onAck: (operation: O) => void | Promise<void>
) {
  const storageKey = "folio-library-operation:" + (session.scope().uid ?? "") + ":" + key;
  const readPending = (): {
    state: OperationState<O, R> | null;
    original: string | null;
    failed: boolean;
  } => {
    let original: string | null = null;
    try {
      original = sessionStorage.getItem(storageKey);
      if (original === null) return { state: null, original: null, failed: false };
      const saved = JSON.parse(original) as {
        envelope?: Partial<O>;
        invalidated?: boolean;
      } | null;
      if (
        !saved ||
        typeof saved !== "object" ||
        Object.keys(saved).length !== 2 ||
        typeof saved.invalidated !== "boolean" ||
        !saved.envelope ||
        typeof saved.envelope !== "object" ||
        typeof saved.envelope.opId !== "string" ||
        typeof saved.envelope.uid !== "string" ||
        !saved.envelope.scope ||
        typeof saved.envelope.scope !== "object"
      )
        throw Error("incompatible-operation");
      repository.validateRecovered?.(saved.envelope as O);
      return {
        state: {
          envelope: saved.envelope as O,
          status:
            saved.invalidated || !equal(saved.envelope.scope, session.scope())
              ? "invalidated"
              : "unknown",
        },
        original: null,
        failed: false,
      };
    } catch {
      return { state: null, original, failed: true };
    }
  };
  const [initial] = useState(readPending);
  const [state, setState] = useState<OperationState<O, R> | null>(initial.state);
  const [recoveryOriginal, setRecoveryOriginal] = useState(initial.original);
  const [storageBlocked, setStorageBlocked] = useState(initial.failed);
  const [error, setError] = useState(initial.failed),
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
      const existing = readPending();
      if (existing.failed) {
        setRecoveryOriginal(existing.original);
        setStorageBlocked(true);
        throw Error("operation-storage");
      }
      if (
        existing.state &&
        !equal(existing.state.envelope, envelope) &&
        !equal(existing.state.envelope, currentState.current?.envelope)
      )
        throw Error("newer-operation");
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
            if (saved && !saved.invalidated && equal(saved.envelope, c.state.envelope)) {
              sessionStorage.removeItem(storageKey);
              if (sessionStorage.getItem(storageKey) !== null) throw Error("storage");
            }
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
    recoveryOriginal,
    storageBlocked,
    retryStorage: async () => {
      const restored = readPending();
      setRecoveryOriginal(restored.original);
      setStorageBlocked(restored.failed);
      setError(restored.failed);
      if (!controller.current && !restored.failed) {
        setState(restored.state);
        currentState.current = restored.state;
      }
      if (!restored.failed && controller.current?.state.status === "acknowledged") {
        try {
          const check = session.ticket(),
            envelope = controller.current.state.envelope;
          await ack.current(envelope);
          check();
          if (!live.current) return false;
          const saved = readPending();
          if (saved.failed) throw Error("storage");
          if (saved.state && equal(saved.state.envelope, envelope)) {
            sessionStorage.removeItem(storageKey);
            if (sessionStorage.getItem(storageKey) !== null) throw Error("storage");
          }
        } catch {
          setError(true);
          return false;
        }
      }
      return !restored.failed;
    },
    preserveUnreadable: () => {
      const restored = readPending();
      if (!restored.failed || restored.original === null) return false;
      try {
        const archive = storageKey + ":original:" + crypto.randomUUID();
        sessionStorage.setItem(archive, restored.original);
        if (
          sessionStorage.getItem(archive) !== restored.original ||
          sessionStorage.getItem(storageKey) !== restored.original
        )
          throw Error("storage");
        sessionStorage.removeItem(storageKey);
        if (sessionStorage.getItem(storageKey) !== null) throw Error("storage");
        setRecoveryOriginal(null);
        setStorageBlocked(false);
        setError(false);
        setState(null);
        currentState.current = null;
        return true;
      } catch {
        setError(true);
        return false;
      }
    },
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
      if (
        storageBlocked ||
        preparing ||
        state?.status === "pending" ||
        state?.status === "unknown"
      )
        return;
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
