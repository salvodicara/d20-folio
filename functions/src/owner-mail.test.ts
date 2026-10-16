/**
 * owner-mail — the SMTP config gate shared by the owner's emails.
 */
import { describe, it, expect } from "vitest";
import { resolveMailConfig } from "./owner-mail";

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
