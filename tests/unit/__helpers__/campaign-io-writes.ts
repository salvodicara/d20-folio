/**
 * The tray and the play actions write fight effects through a lazily imported
 * campaign IO module (`import("@/features/campaigns/campaign-io")`) and never await
 * the write. A test that mocks that module waits for the write deterministically:
 * `loadCampaignIo()` in `beforeAll` loads the module once, so the code's own
 * `import()` resolves from the module cache, and `writesSettled()` then lets one
 * macrotask run the write's `.then`. No wall-clock budget: a 1-second `vi.waitFor`
 * failed whenever a loaded machine made the first import slow.
 */
export async function loadCampaignIo(): Promise<void> {
  await import("@/features/campaigns/campaign-io");
}

export async function writesSettled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
