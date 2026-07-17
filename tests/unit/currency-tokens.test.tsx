/**
 * CurrencyTokens (D52) — the shared `.cur-tok` coin row used by the inventory
 * currency, the treasury totals, and the treasury adjust picker. Guards the three
 * modes (display / editable / selectable) and the honest-blank zero marker.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CurrencyTokens } from "@/components/shared/CurrencyTokens";

const VALUES = { pp: 2, gp: 145, ep: 0, sp: 30, cp: 0 };

describe("CurrencyTokens", () => {
  it("renders every coin with its amount + label and marks zero coins", () => {
    const { container } = render(<CurrencyTokens values={VALUES} />);
    expect(screen.getByText("145")).toBeInTheDocument();
    // ep + cp are zero → honest-blank data attr (dimmed via CSS).
    const zeros = container.querySelectorAll('.cur-tok[data-zero="true"]');
    expect(zeros).toHaveLength(2);
  });

  it("selectable mode renders buttons and reports the chosen metal", () => {
    const onSelect = vi.fn();
    render(
      <CurrencyTokens values={VALUES} selectable selected="gp" onSelect={onSelect} />
    );
    const pp = screen.getByRole("button", { name: /pp/i });
    expect(screen.getByRole("button", { name: /gp/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(pp);
    expect(onSelect).toHaveBeenCalledWith("pp");
  });

  it("hideAmounts renders a denomination picker (labels only, no balances)", () => {
    render(
      <CurrencyTokens
        values={{ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }}
        selectable
        hideAmounts
        selected="sp"
        onSelect={vi.fn()}
      />
    );
    // The chosen coin is pressed; no "0" balance leaks into the picker.
    expect(screen.getByRole("button", { name: /sp/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("editable mode commits an edited amount through onChange", () => {
    const onChange = vi.fn();
    render(<CurrencyTokens values={VALUES} editable onChange={onChange} />);
    // The gp amount is an InlineEditable; activating it exposes a number input.
    const gp = screen.getByText("145");
    fireEvent.click(gp);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "200" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("gp", 200);
  });

  // B20: a party past InlineEditable's generic 9999 default ceiling must not have
  // their coins silently truncated — a legitimate hoard commits in full.
  it("does not clamp a large legitimate hoard to the generic 9999 default ceiling", () => {
    const onChange = vi.fn();
    render(<CurrencyTokens values={VALUES} editable onChange={onChange} />);
    const gp = screen.getByText("145");
    fireEvent.click(gp);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "25000" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("gp", 25000);
  });
});
