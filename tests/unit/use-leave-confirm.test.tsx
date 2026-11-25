/**
 * Leaving a half-done creation or level-up asks first (#1230; the classic wizards'
 * guard, now one hook for both UIs). Cases come from the guard itself: a pristine
 * screen leaves at once; a touched one asks «discard?», «Discard» leaves and
 * «Continue» stays; the screen's own finish (Create, Confirm level) never asks; a
 * refresh or tab close gets the browser's own prompt only when touched.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, Link, RouterProvider, useNavigate } from "react-router";

import { useLeaveConfirm } from "@/hooks/useLeaveConfirm";
import { useConfirmStore } from "@/stores/confirmStore";

afterEach(() => useConfirmStore.setState({ open: false, options: null, _resolve: null }));

function Screen({ dirty }: { dirty: boolean }) {
  const navigate = useNavigate();
  const { finishing } = useLeaveConfirm(dirty, { title: "Leave?", message: "Lost." });
  return (
    <>
      <Link to="/away">away</Link>
      <button
        type="button"
        onClick={() => {
          finishing();
          void navigate("/away");
        }}
      >
        finish
      </button>
    </>
  );
}

function mount(dirty: boolean) {
  const router = createMemoryRouter(
    [
      { path: "/here", element: <Screen dirty={dirty} /> },
      { path: "/away", element: <p>away page</p> },
    ],
    { initialEntries: ["/here"] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

const click = async (name: string) => {
  await act(async () => {
    screen.getByText(name).click();
    await Promise.resolve();
  });
};
const answer = async (ok: boolean) => {
  await act(async () => {
    useConfirmStore.getState().respond(ok);
    await Promise.resolve();
  });
};

describe("useLeaveConfirm", () => {
  it("a pristine screen leaves at once", async () => {
    const router = mount(false);
    await click("away");
    expect(router.state.location.pathname).toBe("/away");
    expect(useConfirmStore.getState().open).toBe(false);
  });

  it("a touched screen asks; «Continue» stays", async () => {
    const router = mount(true);
    await click("away");
    expect(useConfirmStore.getState().options?.title).toBe("Leave?");
    await answer(false);
    expect(router.state.location.pathname).toBe("/here");
  });

  it("a touched screen asks; «Discard» leaves", async () => {
    const router = mount(true);
    await click("away");
    await answer(true);
    expect(router.state.location.pathname).toBe("/away");
  });

  it("the screen's own finish never asks", async () => {
    const router = mount(true);
    await click("finish");
    expect(useConfirmStore.getState().open).toBe(false);
    expect(router.state.location.pathname).toBe("/away");
  });

  it("a refresh gets the browser's prompt only when touched", () => {
    mount(true);
    const touched = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(touched);
    expect(touched.defaultPrevented).toBe(true);
  });
});
