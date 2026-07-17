/**
 * signup-email — the PURE owner-notification email formatter (OWN-38).
 */
import { describe, it, expect } from "vitest";
import { formatSignupEmail, resolveMailConfig } from "./signup-email";

describe("formatSignupEmail", () => {
  it("builds subject/text/html with the user's details + admin link", () => {
    const msg = formatSignupEmail({
      uid: "abc123",
      email: "new@player.com",
      displayName: "Lyra",
      createdAt: "2026-06-05T10:00:00.000Z",
    });
    expect(msg.subject).toBe("New d20 Folio sign-up: Lyra");
    expect(msg.text).toContain("abc123");
    expect(msg.text).toContain("new@player.com");
    expect(msg.text).toContain("https://d20-folio.web.app/admin");
    expect(msg.html).toContain("<code>abc123</code>");
    expect(msg.html).toContain('href="https://d20-folio.web.app/admin"');
  });

  it("falls back gracefully when fields are missing", () => {
    const msg = formatSignupEmail({ uid: "u" });
    expect(msg.subject).toBe("New d20 Folio sign-up: (no name)");
    expect(msg.text).toContain("(no email)");
  });

  it("escapes HTML-significant characters in the display name", () => {
    const msg = formatSignupEmail({ uid: "u", displayName: "<script>x</script>" });
    expect(msg.html).toContain("&lt;script&gt;");
    expect(msg.html).not.toContain("<script>x");
  });
});

describe("resolveMailConfig — the fail-loud-but-no-throw config gate", () => {
  const full = {
    host: "smtp.example.com",
    user: "mailer@example.com",
    pass: "app-password",
    from: "d20 Folio <mailer@example.com>",
    to: "owner@example.com",
  };

  it("OWNER_EMAIL unset → null (the trigger error-logs and returns), never a throw", () => {
    expect(() => resolveMailConfig({ ...full, to: "" })).not.toThrow();
    expect(resolveMailConfig({ ...full, to: "" })).toBeNull();
  });

  it("has NO destination fallback — only the secret feeds `to`", () => {
    const config = resolveMailConfig(full);
    expect(config?.to).toBe("owner@example.com");
  });

  it("missing MAIL_USER or MAIL_PASS → null", () => {
    expect(resolveMailConfig({ ...full, user: "" })).toBeNull();
    expect(resolveMailConfig({ ...full, pass: "" })).toBeNull();
  });

  it("defaults host to Gmail and from to the user when unset", () => {
    const config = resolveMailConfig({ ...full, host: "", from: "" });
    expect(config).toEqual({
      host: "smtp.gmail.com",
      user: full.user,
      pass: full.pass,
      from: full.user,
      to: full.to,
    });
  });
});
