/**
 * The gold hover lift of the Play sheet's chips and buttons is for a real hover only
 * (#1333 review): on a touch screen a tap leaves `:hover` stuck where the finger was,
 * and when the layout shifts under it an unselected chip («Trattieni il respiro»)
 * glows gold as if it were picked. The look of a pick is `aria-pressed` alone.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/ui/ui.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

/** The at-rule headers enclosing the character at `index`, outermost first. */
function enclosing(index: number): string[] {
  const stack: string[] = [];
  let header = "";
  for (let i = 0; i < index; i++) {
    const c = css.charAt(i);
    if (c === "{") {
      stack.push(header.trim());
      header = "";
    } else if (c === "}") {
      stack.pop();
      header = "";
    } else if (c === ";") header = "";
    else header += c;
  }
  return stack.filter((h) => h.startsWith("@"));
}

describe("chip and button hover", () => {
  const rules = [
    '.fui .f-sheet .f-chip:not([aria-disabled="true"]):is(button):hover',
    '.fui .f-sheet .f-btn:not([aria-disabled="true"]):hover',
  ];
  it.each(rules)("%s lights only on a device that can hover", (selector) => {
    const at = css.indexOf(selector);
    expect(at).toBeGreaterThan(-1);
    expect(enclosing(at)).toContain("@media (hover: hover)");
  });
});
