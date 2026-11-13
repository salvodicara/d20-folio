/**
 * «A new version is available — Reload» (coordinator ticket, 2026-11-13). The service
 * worker updates itself (`autoUpdate`): a new worker that takes over a page an older one
 * controlled means a new version is live while the page still runs the old code. The
 * page's first worker taking control is not an update. Coming back to the app asks the
 * browser to look for a new worker, at most once a minute.
 */
import { describe, expect, it, vi } from "vitest";

import { createAppUpdateWatch, reloadWhenSaved } from "@/app/app-update";

/** A stand-in for `navigator.serviceWorker` and the page's visibility. */
function fakeEnv(opts: { controlled: boolean }) {
  const swListeners = new Set<() => void>();
  const docListeners = new Set<() => void>();
  const update = vi.fn(() => Promise.resolve());
  let now = 0;
  const env = {
    serviceWorker: {
      controller: opts.controlled ? {} : null,
      addEventListener: (_: "controllerchange", fn: () => void) => swListeners.add(fn),
      getRegistration: () => Promise.resolve({ update }),
    },
    document: {
      visibilityState: "visible" as DocumentVisibilityState,
      addEventListener: (_: "visibilitychange", fn: () => void) => docListeners.add(fn),
    },
    now: () => now,
  };
  return {
    env,
    update,
    takeOver: () => {
      for (const fn of swListeners) fn();
    },
    comeBack: (atMs: number) => {
      now = atMs;
      for (const fn of docListeners) fn();
    },
  };
}

describe("the new-version watch", () => {
  it("a new worker taking over an already-controlled page: a new version is ready", () => {
    const fake = fakeEnv({ controlled: true });
    const watch = createAppUpdateWatch(fake.env);
    const seen = vi.fn();
    watch.subscribe(seen);
    expect(watch.ready()).toBe(false);
    fake.takeOver();
    expect(watch.ready()).toBe(true);
    expect(seen).toHaveBeenCalled();
  });

  it("the page's first worker taking control is not an update; the next one is", () => {
    const fake = fakeEnv({ controlled: false });
    const watch = createAppUpdateWatch(fake.env);
    fake.takeOver();
    expect(watch.ready()).toBe(false);
    fake.takeOver();
    expect(watch.ready()).toBe(true);
  });

  it("coming back to the app looks for a new version, at most once a minute", async () => {
    const fake = fakeEnv({ controlled: true });
    createAppUpdateWatch(fake.env);
    const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
    fake.comeBack(120_000);
    fake.comeBack(150_000);
    await settled();
    expect(fake.update).toHaveBeenCalledTimes(1);
    fake.comeBack(181_000);
    await settled();
    expect(fake.update).toHaveBeenCalledTimes(2);
  });

  it("closing the bar hides it until the next new version", () => {
    const fake = fakeEnv({ controlled: true });
    const watch = createAppUpdateWatch(fake.env);
    fake.takeOver();
    watch.dismiss();
    expect(watch.ready()).toBe(false);
    fake.takeOver();
    expect(watch.ready()).toBe(true);
  });
});

// Coordinator, 2026-11-13: «Reload» must not lose what the player just did. An open
// dialog covers the bar (the scrim and the native modal sit above the dock), so a typed
// number cannot be lost; an action tapped a moment before may still be on its way to the
// server (#1178), so the reload waits for the pending writes, a few seconds at most.
describe("Reload waits for the pending writes", () => {
  it("reloads once the writes are on the server", async () => {
    const reload = vi.fn();
    let settle: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => (settle = resolve));
    const done = reloadWhenSaved(() => pending, reload, 3_000);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reload).not.toHaveBeenCalled();
    settle();
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads anyway after the cap (offline: the writes wait in the local queue)", async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const done = reloadWhenSaved(() => new Promise<void>(() => undefined), reload, 3_000);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("a failed wait still reloads", async () => {
    const reload = vi.fn();
    await reloadWhenSaved(() => Promise.reject(new Error("no db")), reload, 3_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
