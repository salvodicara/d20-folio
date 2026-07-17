/**
 * CharacterIdentityLine — the shared "race · class level (subclass)" chrome used by
 * the roster card AND the campaign party card.
 *
 * The regression it guards: the party card used to store a PRE-localized string that
 * froze in the writer's language. These tests pin that the line composes from the
 * structured srd slugs and RE-LOCALIZES when the locale changes (the exact behaviour
 * the frozen string lacked), with the class in gilt (`<em>`) and the subclass on its
 * own line.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { CharacterIdentityLine } from "@/components/shared/CharacterIdentityLine";

// Control the locale the component reads, so we can prove it re-localizes.
const localeState = { language: "en" as "en" | "it" };
vi.mock("@/hooks/useLocale", () => ({
  useLocale: () => ({ language: localeState.language }),
}));

beforeEach(() => {
  localeState.language = "en";
});

describe("CharacterIdentityLine", () => {
  it("composes 'race · class level' with the class emphasised (gilt <em>)", () => {
    const { container } = render(
      <CharacterIdentityLine race="Elf" classes={[{ classId: "bard", level: 9 }]} />
    );
    const sub = container.querySelector(".ch-sub");
    expect(sub?.textContent).toBe("Elf · Bard 9");
    // The class+level live in the <em> (the gold chrome); the race does not.
    expect(sub?.querySelector("em")?.textContent).toBe("Bard 9");
  });

  it("RE-LOCALIZES when the locale flips EN→IT (the frozen-string bug)", () => {
    const { container, rerender } = render(
      <CharacterIdentityLine race="Elf" classes={[{ classId: "bard", level: 9 }]} />
    );
    const en = container.querySelector(".ch-sub")?.textContent;
    expect(en).toBe("Elf · Bard 9");

    localeState.language = "it";
    rerender(
      <CharacterIdentityLine race="Elf" classes={[{ classId: "bard", level: 9 }]} />
    );
    const it = container.querySelector(".ch-sub")?.textContent;
    // The IT SRD terms differ from EN — the line must have changed (not frozen).
    expect(it).not.toBe(en);
    expect(it).toContain("9");
  });

  it("renders the subclass on its own line when given", () => {
    const { container } = render(
      <CharacterIdentityLine
        race="Elf"
        classes={[{ classId: "bard", level: 9, subclassId: "college-of-lore" }]}
      />
    );
    const sub = container.querySelector(".ch-sub");
    expect(sub?.querySelector("br")).not.toBeNull();
    // the raw kebab srdId must never leak — it's title-cased / localized.
    expect(sub?.textContent).not.toContain("college-of-lore");
  });

  it("omits the separator when only one part is present", () => {
    const { container } = render(
      <CharacterIdentityLine classes={[{ classId: "wizard", level: 1 }]} />
    );
    expect(container.querySelector(".ch-sub")?.textContent).toBe("Wizard 1");
  });
});
