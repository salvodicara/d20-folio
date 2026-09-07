import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { OperationController, type OperationState } from "@/lib/shared/controller";
import {
  equal,
  validateOperation,
  type AssignmentOperation,
  type Receipt,
} from "@/lib/shared/model";
import type { SharedRepository } from "@/lib/shared/model";
import type { SessionController } from "@/lib/identity/session";
import type { FolioCampaign, FolioCharacter } from "@/lib/identity/model";

export function SharedAssignment({
  character,
  campaigns,
  repository,
  session,
  onDone,
}: {
  character: FolioCharacter;
  campaigns: readonly FolioCampaign[];
  repository: SharedRepository;
  session: SessionController;
  onDone: () => void;
}) {
  const { t } = useTranslation("common");
  const key = "folio-p03-assignment:" + character.ownerUid + ":" + character.id;
  const [recovery] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const saved = JSON.parse(raw) as {
        operation: AssignmentOperation;
        invalidated?: boolean;
      };
      validateOperation(saved.operation);
      if (
        saved.operation.target.ownerUid !== character.ownerUid ||
        saved.operation.target.id !== character.id
      )
        return null;
      return saved;
    } catch {
      return null;
    }
  });
  const restore = useRef(recovery);
  const [destination, setDestination] = useState(
    recovery
      ? (recovery.operation.campaignId ?? "")
      : (character.currentAssignment?.campaignId ?? "")
  );
  const [operation, setOperation] = useState<AssignmentOperation | null>(
    recovery?.operation ?? null
  );
  const [state, setState] = useState<OperationState<AssignmentOperation, Receipt> | null>(
    recovery
      ? {
          envelope: recovery.operation,
          status:
            recovery.invalidated || !equal(recovery.operation.scope, session.scope())
              ? "invalidated"
              : "unknown",
        }
      : null
  );
  const [reload, setReload] = useState(0);
  const controller = useRef<OperationController<AssignmentOperation, Receipt> | null>(
    null
  );
  const detach = useRef<() => void>(() => {});
  useEffect(() => {
    let live = true;
    const check = session.ticket();
    if (restore.current) return;
    void repository
      .assignmentIntent(
        { ownerUid: character.ownerUid, id: character.id },
        destination || null
      )
      .then((op) => {
        check();
        if (!live) return;
        setOperation(op);
      })
      .catch(() => {
        if (live) setOperation(null);
      });
    return () => {
      live = false;
    };
  }, [character.ownerUid, character.id, destination, repository, session, reload, key]);
  useEffect(() => {
    const stop = session.track(() => {
      controller.current?.invalidate();
      try {
        const raw = sessionStorage.getItem(key);
        if (raw)
          sessionStorage.setItem(
            key,
            JSON.stringify({
              ...(JSON.parse(raw) as Record<string, unknown>),
              invalidated: true,
            })
          );
      } catch {
        /* Session fence still prevents dispatch. */
      }
    });
    return () => {
      detach.current();
      controller.current?.invalidate();
      stop();
    };
  }, [session, key]);
  const locked = state?.status === "pending" || state?.status === "unknown";
  const conflict =
    state && ["conflict", "invalidated", "rejected"].includes(state.status);
  function save() {
    if (!operation) return;
    if (controller.current) {
      void controller.current.retry();
      return;
    }
    // An unchanged selection is a read-only dismissal, not another assignment.
    if (
      !state &&
      (operation.authority.assignment?.campaignId ?? null) === operation.campaignId
    ) {
      onDone();
      return;
    }
    try {
      sessionStorage.setItem(key, JSON.stringify({ operation }));
    } catch {
      /* In-memory intent remains stable. */
    }
    const c = new OperationController(operation, repository);
    controller.current = c;
    detach.current = c.subscribe(() => {
      setState(c.state);
      if (c.state.status === "acknowledged") {
        sessionStorage.removeItem(key);
        onDone();
      }
    });
    setState(c.state);
    void c.retry();
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p>{t("identity.assignmentIntro")}</p>
      <label>
        {t("identity.campaign")}
        <select
          value={destination}
          disabled={locked}
          onChange={(e) => {
            detach.current();
            controller.current?.invalidate();
            controller.current = null;
            restore.current = null;
            sessionStorage.removeItem(key);
            setOperation(null);
            setState(null);
            setDestination(e.target.value);
          }}
        >
          <option value="">{t("identity.independent")}</option>
          {campaigns
            .filter((c) => !c.archived)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <div className="identity-actions">
        {conflict ? (
          <button
            type="button"
            onClick={() => {
              detach.current();
              controller.current?.invalidate();
              controller.current = null;
              restore.current = null;
              sessionStorage.removeItem(key);
              setState(null);
              setOperation(null);
              setReload((v) => v + 1);
            }}
          >
            {t("identity.operationReview")}
          </button>
        ) : (
          <button
            className="identity-primary"
            disabled={!operation || state?.status === "pending"}
          >
            {t(
              state?.status === "unknown"
                ? "identity.operationCheck"
                : "identity.saveAssignment"
            )}
          </button>
        )}
        <button type="button" onClick={onDone}>
          {t("identity.close")}
        </button>
      </div>
      <p role="status">
        {state
          ? t(`identity.operation${state.status}`)
          : !operation
            ? t("identity.operationLoadError")
            : ""}
      </p>
    </form>
  );
}
