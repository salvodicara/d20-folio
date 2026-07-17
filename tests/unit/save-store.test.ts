import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the firestore module so importing saveStore does NOT pull in Firebase
// app initialisation. saveStore only needs the mutable saveStatusCallbacks object.
vi.mock("@/lib/firestore", () => ({
  saveStatusCallbacks: { onPending() {}, onSaving() {}, onSaved() {}, onError() {} },
}));
// online-status subscribes to window events at import; keep it a no-op so the
// store's initial `online` value is whatever we set in beforeEach.
vi.mock("@/lib/online-status", () => ({
  subscribeToOnlineStatus: () => () => {},
}));

import { useSaveStore } from "@/stores/saveStore";

function reset(online = true) {
  useSaveStore.setState({
    status: "saved",
    online,
    lastSavedAt: null,
    errorMessage: null,
  });
}

describe("saveStore — status transitions", () => {
  beforeEach(() => reset(true));

  it("markPending → 'pending' when online", () => {
    useSaveStore.getState().markPending();
    expect(useSaveStore.getState().status).toBe("pending");
  });

  it("markPending → 'offline' when offline (does not show 'pending' with no connection)", () => {
    reset(false);
    useSaveStore.getState().markPending();
    expect(useSaveStore.getState().status).toBe("offline");
  });

  it("markSaving → 'saving'", () => {
    useSaveStore.getState().markSaving();
    expect(useSaveStore.getState().status).toBe("saving");
  });

  it("markSaving → 'offline' when offline (B14 — no perpetual spinner with no connection)", () => {
    reset(false);
    useSaveStore.getState().markSaving();
    expect(useSaveStore.getState().status).toBe("offline");
  });

  it("markSaved → 'saved', sets lastSavedAt, clears error", () => {
    useSaveStore.setState({ status: "error", errorMessage: "boom" });
    useSaveStore.getState().markSaved();
    const s = useSaveStore.getState();
    expect(s.status).toBe("saved");
    expect(s.errorMessage).toBeNull();
    expect(typeof s.lastSavedAt).toBe("number");
  });

  it("markError → 'error' with message", () => {
    useSaveStore.getState().markError("network down");
    const s = useSaveStore.getState();
    expect(s.status).toBe("error");
    expect(s.errorMessage).toBe("network down");
  });

  it("setStatus sets the status directly", () => {
    useSaveStore.getState().setStatus("saving");
    expect(useSaveStore.getState().status).toBe("saving");
  });
});

describe("saveStore — online/offline transitions (rule: don't clobber pending)", () => {
  beforeEach(() => reset(true));

  it("going offline while 'saved' → 'offline'", () => {
    useSaveStore.getState().setOnline(false);
    expect(useSaveStore.getState().status).toBe("offline");
    expect(useSaveStore.getState().online).toBe(false);
  });

  it("coming back online while 'offline' → 'saved'", () => {
    useSaveStore.setState({ status: "offline", online: false });
    useSaveStore.getState().setOnline(true);
    expect(useSaveStore.getState().status).toBe("saved");
    expect(useSaveStore.getState().online).toBe(true);
  });

  it("going offline while 'pending' does NOT clobber pending status", () => {
    useSaveStore.setState({ status: "pending", online: true });
    useSaveStore.getState().setOnline(false);
    // online flag flips, but a queued (pending) save must remain visible as pending
    expect(useSaveStore.getState().online).toBe(false);
    expect(useSaveStore.getState().status).toBe("pending");
  });

  it("coming online while 'pending' leaves status pending (only 'offline' is upgraded)", () => {
    useSaveStore.setState({ status: "pending", online: false });
    useSaveStore.getState().setOnline(true);
    expect(useSaveStore.getState().status).toBe("pending");
  });

  it("going offline while 'error' leaves error (only 'saved' is downgraded)", () => {
    useSaveStore.setState({ status: "error", online: true, errorMessage: "x" });
    useSaveStore.getState().setOnline(false);
    expect(useSaveStore.getState().status).toBe("error");
  });
});
