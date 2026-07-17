/**
 * dom-resilience — the DOM-boundary adapters that keep React alive under
 * EXTERNAL DOM mutation (issue #24).
 *
 * The production crash: Chrome's auto-translate wraps React-owned text nodes in
 * injected `<font>` elements; React still records the ORIGINAL parent in its
 * fiber tree, so a later reconcile calls `recordedParent.removeChild(textNode)`
 * (or `insertBefore` with a now-stale reference) and the DOM throws
 * `NotFoundError: ... not a child of this node`, white-screening the subtree (a
 * live IT-locale Chrome user lost the cockpit Features tab).
 *
 * The fix under test (`src/lib/dom-resilience.ts`, installed by `src/main.tsx`
 * BEFORE the first React render): tolerant `Node.prototype.removeChild` /
 * `insertBefore` wrappers — stale removeChild no-ops, stale insertBefore falls
 * back to appendChild. Translation stays ALLOWED (this superseded the f375edbc
 * `<html translate="no">` ban, which removed a capability and only covered
 * translators — not grammar checkers / password managers / any extension that
 * rewrites the live DOM).
 *
 * These tests simulate the external agents faithfully (translate-style text
 * reparenting WITH a live re-wrapping MutationObserver, and an extension-style
 * ELEMENT reparent) and assert React re-renders DO NOT throw. The known wart is
 * documented inline: after a tolerated stale removal the orphaned node can
 * linger inside the injected wrapper until the next full reconcile — safe but
 * imperfect; crashing is the only unacceptable outcome.
 */
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { useState, type ReactNode } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { installDomResilience } from "@/lib/dom-resilience";

// Install exactly as main.tsx does: once, before anything renders.
beforeAll(() => {
  installDomResilience();
});

afterEach(cleanup);

/**
 * Create the `<font>` element Chrome's translator injects. `<font>` is a
 * deprecated element, so a literal `createElement("font")` resolves to the
 * deprecated typed overload — routing through a `string` picks the generic
 * (non-deprecated) overload.
 */
function makeFont(): HTMLElement {
  const tag: string = "font";
  return document.createElement(tag);
}

/**
 * Reparent every non-empty text node under `root` into a fresh `<font>`,
 * exactly as Chrome's translator does — detaching each text node from the
 * parent React still records for it.
 */
function wrapTextNodesLikeTranslate(root: Element): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.textContent && node.textContent.trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  const targets: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    targets.push(current as Text);
    current = walker.nextNode();
  }
  let wrapped = 0;
  for (const textNode of targets) {
    const parent = textNode.parentNode;
    if (!parent || (parent as Element).tagName === "FONT") continue;
    const font = makeFont();
    parent.replaceChild(font, textNode);
    font.appendChild(textNode);
    wrapped++;
  }
  return wrapped;
}

// ─── the adapted primitives ──────────────────────────────────────────────────

describe("dom-resilience — adapted DOM primitives", () => {
  it("removeChild on a reparented node no-ops and returns the child (was: NotFoundError)", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const span = document.createElement("span");
    const text = document.createTextNode("translate me away");
    span.appendChild(text);
    host.appendChild(span);

    // React's fiber records `span` as the text node's parent here.
    const recordedParent = text.parentNode as Node;
    expect(recordedParent).toBe(span);

    // Chrome's translator reparents the text node into an injected <font>.
    const font = makeFont();
    span.replaceChild(font, text);
    font.appendChild(text);

    // React's commit calls `recordedParent.removeChild(text)`. Natively this is
    // the production NotFoundError; the adapter tolerates it instead.
    expect(recordedParent.removeChild(text)).toBe(text);
    // The node stays where the external agent put it — nothing was destroyed.
    expect(font.contains(text)).toBe(true);

    document.body.removeChild(host);
  });

  it("insertBefore with a stale reference appends instead of throwing", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const anchor = document.createTextNode("anchor");
    host.appendChild(anchor);

    // The translator moves the anchor text node into an injected <font>.
    const font = makeFont();
    host.replaceChild(font, anchor);
    font.appendChild(anchor);

    // React inserts a new sibling "before" the anchor it still records as a
    // child of `host`. Natively: NotFoundError. Adapted: append into `host`.
    const fresh = document.createElement("b");
    expect(host.insertBefore(fresh, anchor)).toBe(fresh);
    expect(fresh.parentNode).toBe(host);

    document.body.removeChild(host);
  });

  it("well-formed calls pass through to the native behaviour untouched", () => {
    const host = document.createElement("div");
    const a = document.createElement("i");
    const b = document.createElement("b");
    host.appendChild(a);
    // Valid insertBefore keeps ordering semantics.
    host.insertBefore(b, a);
    expect(Array.from(host.children).map((el) => el.tagName)).toEqual(["B", "I"]);
    // Valid removeChild really removes.
    host.removeChild(b);
    expect(Array.from(host.children).map((el) => el.tagName)).toEqual(["I"]);
  });

  it("is idempotent — a second install does not re-wrap the prototype", () => {
    // Read the function as an opaque property (not a bound method) so the
    // identity comparison carries no `this` semantics.
    const proto = Node.prototype as unknown as { removeChild: unknown };
    const before = proto.removeChild;
    installDomResilience();
    expect(proto.removeChild).toBe(before);
  });
});

// ─── React survives translate-style text mutation ────────────────────────────

describe("dom-resilience — React re-renders survive simulated auto-translate", () => {
  /** Conditional RAW TEXT child — on removal React calls removeChild on the
   *  text node itself (the exact production path; an element wrapper would
   *  sidestep it because the translator only reparents TEXT nodes). */
  function ToggleText(): ReactNode {
    const [show, setShow] = useState(true);
    return (
      <div data-testid="host">
        <button onClick={() => setShow((s) => !s)}>toggle</button>
        {show ? "translate me away" : null}
      </div>
    );
  }

  it("removing a translator-reparented text node does not throw", () => {
    render(<ToggleText />);
    const host = screen.getByTestId("host");
    expect(wrapTextNodesLikeTranslate(host)).toBeGreaterThan(0);

    // React unmounts the conditional text → removeChild on the reparented node.
    // Pre-adapter this threw the production NotFoundError.
    expect(() => fireEvent.click(screen.getByText("toggle"))).not.toThrow();

    // Documented wart (safe-but-imperfect): the orphaned text node lingers
    // inside the injected <font> — React believes it removed it. The app stays
    // alive and interactive, which is the contract; toggling further re-renders
    // must also keep working.
    expect(() => fireEvent.click(screen.getByText("toggle"))).not.toThrow();
  });

  it("inserting before a translator-reparented anchor does not throw", () => {
    /** New node inserted BEFORE existing raw-text siblings — React resolves the
     *  text node as the insertBefore reference. */
    function PrependDemo(): ReactNode {
      const [lead, setLead] = useState(false);
      return (
        <div data-testid="host">
          {lead ? <b>lead</b> : null}
          {"anchor text"}
          <button onClick={() => setLead(true)}>prepend</button>
        </div>
      );
    }
    render(<PrependDemo />);
    const host = screen.getByTestId("host");
    expect(wrapTextNodesLikeTranslate(host)).toBeGreaterThan(0);

    // React mounts <b> with the reparented "anchor text" node as the reference.
    // Pre-adapter: NotFoundError. Adapted: appended into the host instead
    // (ordering may differ until the next reconcile — better than crashing).
    expect(() => fireEvent.click(screen.getByText("prepend"))).not.toThrow();
    expect(screen.getByText("lead")).toBeInTheDocument();
    expect(screen.getByText("lead").parentNode).toBe(host);
  });

  it("survives a live re-wrapping MutationObserver (the translator stays resident)", async () => {
    // Chrome's translator keeps observing and re-wraps FRESH text React mounts —
    // this is what makes the crash fire on a LATER reconcile, not just once.
    function ListDemo(): ReactNode {
      const [items, setItems] = useState(["alpha", "beta"]);
      return (
        <div data-testid="host">
          <button onClick={() => setItems(["alpha"])}>shrink</button>
          <button onClick={() => setItems(["alpha", "beta", "gamma"])}>grow</button>
          <ul>
            {items.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
        </div>
      );
    }
    render(<ListDemo />);
    const host = screen.getByTestId("host");
    expect(wrapTextNodesLikeTranslate(host)).toBeGreaterThan(0);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const added of Array.from(m.addedNodes)) {
          if (added.nodeType === Node.ELEMENT_NODE) {
            wrapTextNodesLikeTranslate(added as Element);
          }
        }
      }
    });
    observer.observe(host, { childList: true, subtree: true });
    try {
      expect(() => fireEvent.click(screen.getByText("grow"))).not.toThrow();
      // Let the observer re-wrap the freshly mounted <li> text…
      await Promise.resolve();
      // …then have React DELETE list items whose text the observer reparented.
      expect(() => fireEvent.click(screen.getByText("shrink"))).not.toThrow();
      expect(() => fireEvent.click(screen.getByText("grow"))).not.toThrow();
    } finally {
      observer.disconnect();
    }
  });
});

// ─── React survives extension-style ELEMENT mutation (the wider class) ───────

describe("dom-resilience — React survives non-translate extension mutation", () => {
  it("unmounting an element an extension wrapped in its own container does not throw", () => {
    // Grammar checkers / password managers wrap whole ELEMENTS (not text nodes)
    // in injected containers — the class the old <html translate="no"> ban never
    // covered. React later unmounts the element from its recorded parent.
    function ToggleSpan(): ReactNode {
      const [show, setShow] = useState(true);
      return (
        <div data-testid="host">
          <button onClick={() => setShow((s) => !s)}>toggle</button>
          {show ? <span>flagged sentence</span> : null}
        </div>
      );
    }
    render(<ToggleSpan />);
    const host = screen.getByTestId("host");
    const flagged = screen.getByText("flagged sentence");

    // The extension wraps the React-owned <span> in its own marker element.
    const marker = document.createElement("div");
    marker.dataset.extension = "grammar-underline";
    host.replaceChild(marker, flagged);
    marker.appendChild(flagged);

    // React unmounts the span from `host` (its recorded parent) → stale
    // removeChild, tolerated. Further renders keep working.
    expect(() => fireEvent.click(screen.getByText("toggle"))).not.toThrow();
    expect(() => fireEvent.click(screen.getByText("toggle"))).not.toThrow();
  });
});
