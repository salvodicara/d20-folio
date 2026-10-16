/**
 * owner-digest — the owner's one daily email: new sign-ups and new automatic
 * error reports (owner 2026-10-16: a digest instead of an email per sign-up, and
 * ADR-0008's reports by email instead of checking the inbox).
 */
import { describe, it, expect } from "vitest";
import { formatOwnerDigest, type DigestReport } from "./owner-digest";

const report = (over: Partial<DigestReport> = {}): DigestReport => ({
  uid: "uid-a",
  event: "character.quarantine",
  message: "Invalid character document: invalid-revision",
  createdAtMs: Date.UTC(2026, 9, 16, 9, 0),
  ...over,
});
const signup = {
  uid: "uid-new",
  email: "new@player.com",
  displayName: "Lyra",
  createdAt: "2026-10-16T10:00:00.000Z",
};

describe("formatOwnerDigest", () => {
  it("sends nothing when nothing is new", () => {
    expect(formatOwnerDigest({ signups: [], errors: [] })).toBeNull();
  });

  it("lists each new sign-up with name and email, and links the admin panel", () => {
    const msg = formatOwnerDigest({ signups: [signup], errors: [] });
    expect(msg?.subject).toBe("d20 Folio today: 1 new sign-up");
    expect(msg?.text).toContain("Lyra <new@player.com>");
    expect(msg?.text).toContain("https://d20-folio.web.app/admin");
    expect(msg?.html).toContain("Lyra &lt;new@player.com&gt;");
  });

  it("groups errors by event and message, with counts and how many accounts saw each", () => {
    const msg = formatOwnerDigest({
      signups: [],
      errors: [
        report(),
        report({ uid: "uid-b" }),
        report({ uid: "uid-b" }),
        report({ event: "save.denied", message: "permission-denied" }),
      ],
    });
    expect(msg?.subject).toBe("d20 Folio today: 4 new errors");
    expect(msg?.text).toContain(
      "3× character.quarantine — Invalid character document: invalid-revision (2 accounts)"
    );
    expect(msg?.text).toContain("1× save.denied — permission-denied (1 account)");
    expect(msg?.text.indexOf("character.quarantine")).toBeLessThan(
      msg?.text.indexOf("save.denied") ?? -1
    );
  });

  it("names both in the subject when both are new", () => {
    const msg = formatOwnerDigest({ signups: [signup, signup], errors: [report()] });
    expect(msg?.subject).toBe("d20 Folio today: 2 new sign-ups, 1 new error");
  });

  it("never carries an error reporter's account id", () => {
    const msg = formatOwnerDigest({ signups: [], errors: [report()] });
    expect(msg?.text).not.toContain("uid-a");
    expect(msg?.html).not.toContain("uid-a");
  });

  it("escapes HTML in messages and names", () => {
    const msg = formatOwnerDigest({
      signups: [{ ...signup, displayName: "<b>x</b>" }],
      errors: [report({ message: "<script>x</script>" })],
    });
    expect(msg?.html).toContain("&lt;script&gt;");
    expect(msg?.html).not.toContain("<script>");
    expect(msg?.html).not.toContain("<b>x</b>");
  });
});
