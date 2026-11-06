/** The catalogues that carry painted art, one folder each under /assets/art/. */
export type ArtKind =
  | "spell"
  | "class"
  | "subclass"
  | "feat"
  | "item"
  | "equipment"
  | "monster"
  | "feature"
  | "species"
  | "action";

/** A catalogue entry's painted icon (`/assets/art/<kind>/<id>.webp`): no index in code, the file is the truth. */
export const artUrl = (kind: ArtKind, id: string) => `/assets/art/${kind}/${id}.webp`;
