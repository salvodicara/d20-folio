/**
 * The creation draft as React state — a thin `useReducer` over the core
 * reducer (`lib/creation/draft.ts`). Every creation surface holds its FORM
 * state through this hook; only pure UI state (path, step, open chapters,
 * saving) stays local to the screen.
 */
import { useReducer } from "react";
import {
  creationDraftReducer,
  initialCreationDraft,
  type CreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";

export function useCreationDraft(): [
  CreationDraft,
  (action: CreationDraftAction) => void,
] {
  return useReducer(creationDraftReducer, undefined, initialCreationDraft);
}
