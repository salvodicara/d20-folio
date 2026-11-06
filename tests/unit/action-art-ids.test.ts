/** The painted action icons name exactly the base actions the rules offer, plus the unarmed strike. */
import { expect, it } from "vitest";
import { ACTION_ART_IDS } from "@/data/action-art-ids";
import { BASE_ACTIONS } from "@/lib/smart-tracker";

it("lists every base action and the unarmed strike, nothing else", () => {
  expect([...ACTION_ART_IDS].sort()).toEqual(
    [...BASE_ACTIONS.map((a) => a.id.replace(/^base-/, "")), "unarmed-strike"].sort()
  );
});
