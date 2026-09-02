/**
 * Test helper — mint a deterministic, valid `instanceId` for a custom-entry test
 * fixture (spell / weapon / equipment / feature), so tests never fabricate a raw
 * string that might drift from {@link isItemInstanceId}'s contract. Deterministic
 * on `seed` (usually the fixture's display name) so re-running a test — or diffing
 * a fixture — never shows a spurious id churn.
 */
import { isItemInstanceId } from "@/lib/item-resources";

export function customInstanceId(seed: string): string {
  const id = `custom-${seed.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`.slice(0, 64);
  if (!isItemInstanceId(id)) {
    throw new TypeError(`customInstanceId("${seed}") produced an invalid id: ${id}`);
  }
  return id;
}
