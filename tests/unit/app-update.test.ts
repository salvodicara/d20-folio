/**
 * «A new version is available — Reload» (coordinator ticket, 2026-11-13). The service
 * worker updates itself (`autoUpdate`): a new worker that takes over a page an older one
 * controlled means a new version is live while the page still runs the old code. The
 * page's first worker taking control is not an update. Coming back to the app asks the
 * browser to look for a new worker, at most once a minute.
 */
import { describe, expect, it, vi } from "vitest";

import { createAppUpdateWatch } from "@/app/app-update";

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
