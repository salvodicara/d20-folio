import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { OperationController, type OperationState } from "@/lib/shared/controller";
import {
  equal,
  notePath,
  validateOperation,
  type NoteOperation,
  type NoteSnapshot,
  type NoteTarget,
  type Receipt,
} from "@/lib/shared/model";
import type { SharedRepository } from "@/lib/shared/model";
import type { SessionController } from "@/lib/identity/session";

interface Draft {
  text: string;
  base: NoteSnapshot;
  operation?: NoteOperation;
  invalidated?: boolean;
}
export function SharedNotes({
  repository,
  session,
  target,
  title,
  value,
}: {
  repository: SharedRepository;
  session: SessionController;
  target: NoteTarget;
  title: string;
  value: string;
}) {
  const { t } = useTranslation("common");
  const key = "folio-p03:" + (session.scope().uid ?? "") + ":" + notePath(target);
  const [recovery] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const saved = JSON.parse(raw) as Draft;
      if (
        typeof saved.text !== "string" ||
        saved.text.length > 100000 ||
        !equal(saved.base.target, target) ||
        !Number.isSafeInteger(saved.base.revision)
      )
        return null;
      if (saved.operation) validateOperation(saved.operation);
      return saved;
    } catch {
      return null;
    }
  });
  const owner = target.kind === "personal" && target.ownerUid === session.scope().uid;
  const [cached] = useState<NoteSnapshot | null>(() => {
    if (!owner) return null;
    try {
      const snapshot = JSON.parse(
        sessionStorage.getItem(key + ":verified") ?? "null"
      ) as NoteSnapshot | null;
      return snapshot &&
        equal(snapshot.target, target) &&
        typeof snapshot.text === "string" &&
        Number.isSafeInteger(snapshot.revision) &&
        snapshot.revision >= 0
        ? snapshot
        : null;
    } catch {
      return null;
    }
  });
  const initial = owner ? recovery : null;
  const [current, setCurrent] = useState<NoteSnapshot | null>(initial?.base ?? cached);
  const [draft, setDraft] = useState<Draft | null>(initial);
  const draftRef = useRef<Draft | null>(initial);
  const [state, setState] = useState<OperationState<NoteOperation, Receipt> | null>(
    initial?.operation
      ? {
          envelope: initial.operation,
          status:
            initial.invalidated || !equal(initial.operation.scope, session.scope())
              ? "invalidated"
              : "unknown",
        }
      : null
  );
  const [loadError, setLoadError] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const controller = useRef<OperationController<NoteOperation, Receipt> | null>(null);
  const detach = useRef<() => void>(() => {});
  const recovered = useRef(owner);
  useEffect(() => {
    if (owner && current) {
      try {
        sessionStorage.setItem(key + ":verified", JSON.stringify(current));
      } catch {
        /* The current verified base remains available in memory. */
      }
    }
  }, [owner, current, key]);
  function retain(next: Draft | null) {
    draftRef.current = next;
    setDraft(next);
    try {
      if (next) sessionStorage.setItem(key, JSON.stringify(next));
      else sessionStorage.removeItem(key);
    } catch {
      /* Draft remains in memory if browser storage is unavailable. */
    }
  }
  useEffect(() => {
    let live = true;
    const check = session.ticket();
    void repository
      .readNotes(target)
      .then((snapshot) => {
        check();
        if (!live) return;
        setCurrent(snapshot);
        setLoadError(false);
        if (!recovered.current) {
          recovered.current = true;
          if (recovery) {
            draftRef.current = recovery;
            setDraft(recovery);
            if (recovery.operation)
              setState({
                envelope: recovery.operation,
                status:
                  recovery.invalidated ||
                  !equal(recovery.operation.scope, session.scope())
                    ? "invalidated"
                    : "unknown",
              });
          }
        }
      })
      .catch(() => {
        if (live) setLoadError(true);
      });
    return () => {
      live = false;
    };
    // A live note update refreshes the remote comparison, never the draft's original base.
  }, [repository, session, key, value, online, target, recovery]);
  useEffect(() => {
    let mounted = true;
    const changed = () => setOnline(navigator.onLine);
    window.addEventListener("online", changed);
    window.addEventListener("offline", changed);
    const untrack = session.track(() => {
      controller.current?.invalidate();
      const saved = draftRef.current;
      if (saved)
        try {
          sessionStorage.setItem(key, JSON.stringify({ ...saved, invalidated: true }));
        } catch {
          /* In-memory invalidation still fences IO. */
        }
      if (mounted) {
        setCurrent(null);
        setDraft(null);
      }
    });
    return () => {
      mounted = false;
      detach.current();
      controller.current?.invalidate();
      untrack();
      window.removeEventListener("online", changed);
      window.removeEventListener("offline", changed);
    };
  }, [session, key]);
  function start() {
    const saved = draftRef.current;
    if (
      !saved ||
      saved.invalidated ||
      ["conflict", "invalidated", "rejected"].includes(state?.status ?? "")
    )
      return;
    if (controller.current) {
      void controller.current.retry();
      return;
    }
    const operation = saved.operation ?? repository.noteIntent(saved.base, saved.text);
    retain({ ...saved, operation });
    const c = new OperationController(operation, repository);
    controller.current = c;
    detach.current = c.subscribe(() => {
      setState(c.state);
      if (c.state.status === "acknowledged") {
        retain(null);
        const revision = c.state.receipt?.revision ?? saved.base.revision + 1;
        setCurrent((previous) =>
          previous && previous.revision > revision
            ? previous
            : { ...saved.base, text: saved.text, revision }
        );
      }
    });
    setState(c.state);
    if (saved.operation) void c.retry();
    else void c.submit();
  }
  const blocked = state?.status === "pending";
  const conflict =
    draft?.invalidated ||
    state?.status === "conflict" ||
    state?.status === "invalidated" ||
    state?.status === "rejected";
  return (
    <form
      className="identity-notes"
      onSubmit={(e) => {
        e.preventDefault();
        start();
      }}
    >
      <label>
        {title}
        <textarea
          value={draft?.text ?? current?.text ?? value}
          maxLength={20000}
          disabled={!current || blocked || !!draft?.operation}
          onChange={(e) => {
            if (!current) return;
            detach.current();
            controller.current = null;
            setState(null);
            retain({ text: e.target.value, base: draftRef.current?.base ?? current });
          }}
        />
      </label>
      <div className="identity-actions">
        {!conflict && (
          <button disabled={!draft || blocked} type="submit">
            {t(
              state?.status === "unknown"
                ? "identity.operationCheck"
                : "identity.saveNotes"
            )}
          </button>
        )}
        {conflict && (
          <button
            type="button"
            disabled={!online || !current}
            onClick={() => {
              const saved = draftRef.current;
              if (!saved || !current) return;
              detach.current();
              controller.current?.invalidate();
              controller.current = null;
              setState(null);
              retain({ text: saved.text, base: current });
            }}
          >
            {t("identity.operationReview")}
          </button>
        )}
        {draft && !blocked && state?.status !== "unknown" && (
          <button
            type="button"
            onClick={() => {
              detach.current();
              controller.current?.invalidate();
              controller.current = null;
              retain(null);
              setState(null);
            }}
          >
            {t("identity.cancel")}
          </button>
        )}
      </div>
      <p role="status" className="identity-operation-status">
        {!online
          ? t("identity.operationOffline")
          : draft?.invalidated
            ? t("identity.operationinvalidated")
            : loadError
              ? t("identity.operationLoadError")
              : state
                ? t(`identity.operation${state.status}`)
                : draft
                  ? t("identity.operationDraft")
                  : ""}
      </p>
      {conflict && current && (
        <details open>
          <summary>{t("identity.operationLatest")}</summary>
          <p className="identity-note-comparison">
            {current.text || t("identity.operationEmpty")}
          </p>
        </details>
      )}
    </form>
  );
}
