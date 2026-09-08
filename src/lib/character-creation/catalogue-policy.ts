import { packClassTables, packFeats } from "@pack";
import type { CataloguePool, CataloguePoolQuery } from "../homebrew/choice-pools";
export const CREATION_CATALOGUE = "dnd-2024";
export const CREATION_RELEASE =
  packClassTables.length || packFeats.length ? "composed-p10-1" : "srd-5.2.1-p10-1";
export const CREATION_ADAPTER_VERSION = 1;
export const creationPool = (query: CataloguePoolQuery): CataloguePool => ({
  kind: "catalogue",
  catalogue: CREATION_CATALOGUE,
  release: CREATION_RELEASE,
  adapterVersion: CREATION_ADAPTER_VERSION,
  query,
});
