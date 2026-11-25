/**
 * The creation draft as React state — a thin `useReducer` over the core
 * reducer (`lib/creation/draft.ts`). Every creation surface holds its FORM
 * state through this hook; only pure UI state (path, step, open chapters,
 * saving) stays local to the screen. The draft survives a reload: it starts from
 * the account's saved draft and is kept on every change (`lib/local-draft.ts`); the
 * screen clears it once «Create» succeeds.
 */
import { useEffect, useReducer } from "react";
import {
  creationDraftReducer,
  initialCreationDraft,
  type CreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";
import { loadCreationDraft, saveCreationDraft } from "@/lib/local-draft";
import { useAuthStore } from "@/stores/authStore";

export function useCreationDraft(): [
  CreationDraft,
  (action: CreationDraftAction) => void,
] {
  const uid = useAuthStore((s) => s.user?.uid);
  const [draft, dispatch] = useReducer(creationDraftReducer, uid, (id) => ({
    ...initialCreationDraft(),
    ...(id ? loadCreationDraft(id) : null),
  }));
  useEffect(() => {
    if (uid) saveCreationDraft(uid, draft);
  }, [uid, draft]);
  return [draft, dispatch];
}
