/**
 * DOM-boundary resilience adapters — tolerate EXTERNAL mutation of React-owned
 * DOM (production issue #24).
 *
 * ## The bug class
 * Browser machine translation (Chrome's built-in translator, translation
 * extensions) — and more generally ANY extension that rewrites the live page
 * (grammar checkers, password managers) — reparents or replaces nodes that
 * React created. Chrome's translator wraps every text node in an injected
 * `<font>` element; React still records the ORIGINAL parent for that node in
 * its fiber tree, so the next reconcile calls
 * `recordedParent.removeChild(textNode)` (or
 * `recordedParent.insertBefore(node, staleRef)`) against a tree that no longer
 * matches its picture — and the DOM throws
 * `NotFoundError: ... is not a child of this node`, white-screening the whole
 * subtree through the error boundary (a live IT-locale Chrome user lost the
 * cockpit Features tab this way).
 *
 * ## The fix (the established React translate-proofing pattern,
 * cf. facebook/react#11538)
 * Make the two commit-phase DOM primitives tolerant of a stale tree picture,
 * at the `Node.prototype` boundary, BEFORE React mounts:
 *  - `removeChild(child)` where `child` is no longer a child of the receiver →
 *    no-op and return `child`: the external agent already moved it; there is
 *    nothing left to remove.
 *  - `insertBefore(node, ref)` where `ref` is no longer a child of the
 *    receiver → `appendChild` instead: the new node still enters the correct
 *    parent (its position may be off until the next reconcile settles it —
 *    strictly better than crashing).
 * Every well-formed call passes straight through to the native method.
 *
 * ## Why an adapter, not an opt-out
 * This is a WIRE ADAPTER — the same category as `timestampsToDates`: the
 * outside world hands us state that violates our invariants at a boundary we
 * do not control, and we conform it there, ONCE, for the whole app. The app
 * itself never imperatively mutates React-owned DOM (audited in issue #24);
 * only external agents reach these tolerance branches. The alternative —
 * `<html translate="no">` (commit f375edbc, since removed) — was rejected: it
 * stripped a real capability (a non-EN/IT user machine-translating the app)
 * and only covered translators, not the wider rewrite-the-DOM extension class.
 *
 * PERMANENT and PURE (no Firebase, no React imports). `src/main.tsx` installs
 * it before the first React render — the wrappers must be on the prototype
 * before any commit runs. Idempotent. Documented in `docs/ARCHITECTURE.md`
 * § External DOM mutation resilience; pinned by
 * `tests/unit/dom-resilience.test.tsx` and `tests/e2e/translate-resilience.spec.ts`.
 */

let installed = false;

/**
 * Dev-only, once-per-method logger: we still want to LEARN that an external
 * agent rewrote React-owned DOM, but a chatty extension must not flood the
 * console (the translator fires per text node — thousands of hits).
 */
const warned = new Set<string>();
function warnOnce(method: string, detail: string): void {
  if (!import.meta.env.DEV || warned.has(method)) return;
  warned.add(method);
  console.warn(
    `[dom-resilience] tolerated an external DOM mutation in ${method}: ${detail}. ` +
      "A browser translator or extension is rewriting React-owned DOM; the adapter " +
      "kept the app alive. (Logged once per method.)"
  );
}

/**
 * The two commit-phase primitives, viewed as function-typed PROPERTIES (with an
 * explicit `this: Node`) instead of lib.dom method signatures. This is the
 * honest shape for what we do — capture the native functions and `.call` them
 * with an explicit receiver — and it is what lets `@typescript-eslint/
 * unbound-method` see that no implicit `this` can be lost.
 */
interface NodeTreePrimitives {
  removeChild: <T extends Node>(this: Node, child: T) => T;
  insertBefore: <T extends Node>(this: Node, node: T, child: Node | null) => T;
}

/**
 * Install the tolerant `removeChild` / `insertBefore` wrappers on
 * `Node.prototype`. Call ONCE, before the first React render (see
 * `src/main.tsx`). Safe to call again (no-op) and in non-DOM environments.
 */
export function installDomResilience(): void {
  if (installed || typeof Node === "undefined") return;
  installed = true;

  const proto = Node.prototype as Node & NodeTreePrimitives;

  const nativeRemoveChild = proto.removeChild;
  Node.prototype.removeChild = function removeChildTolerant<T extends Node>(
    this: Node,
    child: T
  ): T {
    if (child.parentNode !== this) {
      warnOnce(
        "removeChild",
        "the node to remove is no longer a child of its recorded parent"
      );
      return child;
    }
    // `.call` on the generic DOM signature widens the return to `Node`; the
    // child we pass IS the T the native method returns, so this is sound.
    return nativeRemoveChild.call(this, child) as T;
  };

  const nativeInsertBefore = proto.insertBefore;
  Node.prototype.insertBefore = function insertBeforeTolerant<T extends Node>(
    this: Node,
    node: T,
    reference: Node | null
  ): T {
    if (reference !== null && reference.parentNode !== this) {
      warnOnce(
        "insertBefore",
        "the reference node is no longer a child of its recorded parent"
      );
      // `.call` on the generic DOM signature widens the return to `Node`; the
      // node we pass IS the T we return, so the assertion is sound.
      return nativeInsertBefore.call(this, node, null) as T;
    }
    return nativeInsertBefore.call(this, node, reference) as T;
  };
}
