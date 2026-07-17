/**
 * Folio atom-layer tests (M2).
 *
 * RTL render + interaction + a11y assertions for the reusable folio atoms.
 * The coverage gate is logic-only (lib/data/stores), so these do not move the
 * threshold — they exist to lock the atoms' behaviour (variants, controlled
 * state, aria wiring, keyboard) per CLAUDE rule 2.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Sparkles, Trash2, BookOpen } from "lucide-react";
import {
  Button,
  Icon,
  Input,
  Textarea,
  SearchInput,
  NumberStepper,
  Field,
  Badge,
  MagicMark,
  FocusMark,
  EditingPill,
  Switch,
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  Segmented,
  TooltipProvider,
  Tooltip,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Dialog,
  DialogContent,
  DialogBody,
  DialogFooter,
  RunicEmptyState,
} from "@/components/ui";

// ─── Button ──────────────────────────────────────────────────────────────────

describe("Button", () => {
  it("renders a real button with the folio .btn class and primary default", () => {
    render(<Button>Cast</Button>);
    const btn = screen.getByRole("button", { name: "Cast" });
    expect(btn).toHaveClass("btn", "primary");
    expect(btn).toHaveAttribute("type", "button");
  });

  it("maps each variant to its folio class", () => {
    const { rerender } = render(<Button variant="secondary">x</Button>);
    expect(screen.getByRole("button")).toHaveClass("secondary");
    rerender(<Button variant="destructive">x</Button>);
    expect(screen.getByRole("button")).toHaveClass("destructive");
    rerender(<Button variant="ghost">x</Button>);
    expect(screen.getByRole("button")).toHaveClass("ghost");
    rerender(<Button variant="dashed">x</Button>);
    expect(screen.getByRole("button")).toHaveClass("dashed");
  });

  it("neutral variant is the bare `.btn` (no gradient class) for tinted recipes", () => {
    render(
      <Button variant="neutral" className="hp-act-dmg">
        Damage
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Damage" });
    // The base `.btn` + the caller's tint, with NO variant class layered on top —
    // so `.btn.hp-act-dmg` (and friends) win without `.primary` overriding them.
    expect(btn).toHaveClass("btn", "hp-act-dmg");
    expect(btn).not.toHaveClass("primary", "secondary", "ghost", "destructive", "dashed");
  });

  it("loading swaps to spinner, blocks clicks, sets aria-busy", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>
    );
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("loading");
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("iconOnly applies the square modifier", () => {
    render(
      <Button iconOnly aria-label="Delete">
        <Icon as={Trash2} decorative />
      </Button>
    );
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("icon-only");
  });

  it("asChild renders the brass styling onto a child element", () => {
    render(
      <Button asChild>
        <a href="/welcome">Enter</a>
      </Button>
    );
    const link = screen.getByRole("link", { name: "Enter" });
    expect(link).toHaveClass("btn", "primary");
  });
});

// ─── Icon ────────────────────────────────────────────────────────────────────

describe("Icon", () => {
  it("applies .icon sizing and is decorative by default", () => {
    const { container } = render(<Icon as={Sparkles} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("icon");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("size modifiers map to icon-sm / icon-lg", () => {
    const { container, rerender } = render(<Icon as={Sparkles} size="sm" />);
    expect(container.querySelector("svg")).toHaveClass("icon-sm");
    rerender(<Icon as={Sparkles} size="lg" />);
    expect(container.querySelector("svg")).toHaveClass("icon-lg");
  });

  it("labelled icon is exposed as an img to AT", () => {
    render(<Icon as={Sparkles} label="Magic" />);
    expect(screen.getByRole("img", { name: "Magic" })).toBeInTheDocument();
  });
});

// ─── Inputs ──────────────────────────────────────────────────────────────────

describe("Input family", () => {
  it("Input carries .input and sets aria-invalid on error", () => {
    render(<Input error placeholder="Name" />);
    const el = screen.getByPlaceholderText("Name");
    expect(el).toHaveClass("input", "error");
    expect(el).toHaveAttribute("aria-invalid", "true");
  });

  it("Textarea is a textarea with .input", () => {
    render(<Textarea aria-label="Notes" />);
    expect(screen.getByLabelText("Notes").tagName).toBe("TEXTAREA");
  });

  it("Input forwards a ref to the underlying <input> (React 19 ref-as-prop)", () => {
    // The HP popover / quick-heal fields ref the field to focus it on open — the
    // ref must reach the real DOM node, not get swallowed by the wrapper.
    let node: HTMLInputElement | null = null;
    render(
      <Input
        ref={(el) => {
          node = el;
        }}
        placeholder="Amount"
      />
    );
    expect(node).toBe(screen.getByPlaceholderText("Amount"));
  });

  it("SearchInput shows a clear button only when non-empty", () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <SearchInput value="" onChange={() => {}} onClear={onClear} aria-label="Search" />
    );
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    rerender(
      <SearchInput
        value="fire"
        onChange={() => {}}
        onClear={onClear}
        aria-label="Search"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("NumberStepper increments/decrements and clamps to min/max", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <NumberStepper
        value={3}
        min={0}
        max={5}
        onChange={onChange}
        ariaLabel="Quantity"
        incrementLabel="More"
        decrementLabel="Less"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(onChange).toHaveBeenLastCalledWith(4);
    fireEvent.click(screen.getByRole("button", { name: "Less" }));
    expect(onChange).toHaveBeenLastCalledWith(2);
    // at max → increment disabled
    rerender(
      <NumberStepper
        value={5}
        min={0}
        max={5}
        onChange={onChange}
        ariaLabel="Quantity"
        incrementLabel="More"
        decrementLabel="Less"
      />
    );
    expect(screen.getByRole("button", { name: "More" })).toBeDisabled();
  });

  it("NumberStepper: a typed value replaces (selected on focus), is integer-only, and is bounded to max", () => {
    const onChange = vi.fn();
    render(
      <NumberStepper
        value={1}
        min={1}
        max={6}
        onChange={onChange}
        ariaLabel="Points"
        incrementLabel="More"
        decrementLabel="Less"
      />
    );
    const input = screen.getByLabelText<HTMLInputElement>("Points");
    // Focus selects the pre-filled value so a typed digit REPLACES it (the bug was
    // clicking a field showing "1" and typing "6" producing "16").
    const selectSpy = vi.spyOn(input, "select");
    fireEvent.focus(input);
    expect(selectSpy).toHaveBeenCalled();
    // A typed value commits as itself…
    fireEvent.change(input, { target: { value: "4" } });
    expect(onChange).toHaveBeenLastCalledWith(4);
    // …above the pool max it clamps…
    fireEvent.change(input, { target: { value: "9" } });
    expect(onChange).toHaveBeenLastCalledWith(6);
    // …non-digits (letters, decimals, minus) are stripped, never entered…
    fireEvent.change(input, { target: { value: "3a" } });
    expect(onChange).toHaveBeenLastCalledWith(3);
    // …you can CLEAR the field while editing (backspace) without it snapping back…
    onChange.mockClear();
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    expect(onChange).not.toHaveBeenCalled();
    // …and an empty field reverts to a valid value on blur (never left invalid).
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("Field wires label/help via id + aria-describedby", () => {
    render(
      <Field label="Armor Class" help="blank = auto">
        {(p) => <Input {...p} />}
      </Field>
    );
    const input = screen.getByLabelText("Armor Class");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      "blank = auto"
    );
  });

  it("Field error takes precedence over help and flags aria-invalid", () => {
    render(
      <Field label="HP" error="Must be ≥ 1" help="hint">
        {(p) => <Input {...p} />}
      </Field>
    );
    const input = screen.getByLabelText("HP");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Must be ≥ 1")).toBeInTheDocument();
    expect(screen.queryByText("hint")).toBeNull();
  });
});

// ─── Badge ───────────────────────────────────────────────────────────────────

describe("Badge", () => {
  it("renders tonal by default with the chip color var", () => {
    render(<Badge color="var(--dmg-fire)">Fire</Badge>);
    const badge = screen.getByText("Fire");
    expect(badge).toHaveClass("badge");
    expect(badge.style.getPropertyValue("--bd-c")).toBe("var(--dmg-fire)");
  });

  it("variant + size modifiers map to folio classes", () => {
    render(
      <Badge variant="solid" size="lg">
        Mastery
      </Badge>
    );
    expect(screen.getByText("Mastery")).toHaveClass("badge", "solid", "lg");
  });

  it("dismiss button calls handler with accessible label", () => {
    const onDismiss = vi.fn();
    render(
      <Badge onDismiss={onDismiss} dismissLabel="Remove Bless">
        Bless
      </Badge>
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Bless" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

// ─── Marks / seals / dots ──────────────────────────────────────────────────────

describe("Folio marks", () => {
  it("MagicMark is decorative by default, labelled when asked", () => {
    const { container, rerender } = render(<MagicMark />);
    expect(container.querySelector(".magic-mark")).toHaveAttribute("aria-hidden", "true");
    rerender(<MagicMark label="Magical" />);
    expect(screen.getByRole("img", { name: "Magical" })).toBeInTheDocument();
  });

  it("FocusMark renders the concentric-rings concentration glyph", () => {
    const { container } = render(<FocusMark label="Concentrating" />);
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Concentrating" })).toBeInTheDocument();
  });
});

// ─── EditingPill ───────────────────────────────────────────────────────────────

describe("EditingPill", () => {
  it("toggles labels + aria-pressed and fires onToggle", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <EditingPill
        editing={false}
        onToggle={onToggle}
        editLabel="Edit"
        editingLabel="Editing"
      />
    );
    const pill = screen.getByRole("button", { name: "Edit" });
    expect(pill).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pill);
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(
      <EditingPill editing onToggle={onToggle} editLabel="Edit" editingLabel="Editing" />
    );
    const editing = screen.getByRole("button", { name: "Editing" });
    expect(editing).toHaveAttribute("aria-pressed", "true");
    expect(editing).toHaveClass("editing");
  });
});

// ─── Selection controls (Radix) ────────────────────────────────────────────────

describe("Selection controls", () => {
  it("Switch exposes role switch + aria-checked and toggles", () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch
        checked={false}
        onCheckedChange={onCheckedChange}
        aria-label="Reduced motion"
      />
    );
    const sw = screen.getByRole("switch", { name: "Reduced motion" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw).toHaveClass("sw");
    fireEvent.click(sw);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("Checkbox exposes role checkbox and reflects checked", () => {
    render(<Checkbox checked aria-label="Prepared" />);
    const cb = screen.getByRole("checkbox", { name: "Prepared" });
    expect(cb).toHaveClass("cb");
    expect(cb).toHaveAttribute("aria-checked", "true");
  });

  it("RadioGroup selects an option and fires onValueChange", () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup value="a" onValueChange={onValueChange} aria-label="Pick">
        <label>
          <RadioGroupItem value="a" aria-label="Option A" />A
        </label>
        <label>
          <RadioGroupItem value="b" aria-label="Option B" />B
        </label>
      </RadioGroup>
    );
    const b = screen.getByRole("radio", { name: "Option B" });
    expect(b).toHaveClass("rb");
    fireEvent.click(b);
    expect(onValueChange).toHaveBeenCalledWith("b");
  });
});

// ─── Segmented ─────────────────────────────────────────────────────────────────

describe("Segmented", () => {
  const options = [
    { value: "dark" as const, label: "Dark" },
    { value: "light" as const, label: "Light" },
    { value: "system" as const, label: "System" },
  ];

  it("marks the active option with aria-pressed and changes on click", () => {
    const onChange = vi.fn();
    render(
      <Segmented options={options} value="dark" onChange={onChange} aria-label="Theme" />
    );
    const group = screen.getByRole("group", { name: "Theme" });
    const light = within(group).getByRole("button", { name: "Light" });
    expect(within(group).getByRole("button", { name: "Dark" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(light);
    expect(onChange).toHaveBeenCalledWith("light");
  });

  it("ArrowRight/ArrowLeft move the selection (keyboard)", () => {
    const onChange = vi.fn();
    render(
      <Segmented options={options} value="dark" onChange={onChange} aria-label="Theme" />
    );
    const dark = screen.getByRole("button", { name: "Dark" });
    fireEvent.keyDown(dark, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("light");
    fireEvent.keyDown(dark, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("system"); // wraps
  });

  it("the `accent` prop colour-codes the active tile (the .accent variant + pigment var)", () => {
    render(
      <Segmented
        options={options}
        value="dark"
        onChange={() => {}}
        accent="var(--lvl-accent)"
        aria-label="Theme"
      />
    );
    const group = screen.getByRole("group", { name: "Theme" });
    expect(group).toHaveClass("seg", "accent");
    expect(group.style.getPropertyValue("--seg-accent")).toBe("var(--lvl-accent)");
  });
});

// ─── Overlays (Radix) ──────────────────────────────────────────────────────────

describe("Tooltip", () => {
  it("renders the trigger; content is wired through Radix", () => {
    render(
      <TooltipProvider>
        <Tooltip content="Proficiency bonus">
          <button>PB</button>
        </Tooltip>
      </TooltipProvider>
    );
    expect(screen.getByRole("button", { name: "PB" })).toBeInTheDocument();
  });
});

describe("Popover", () => {
  it("opens the branded content on trigger click", () => {
    render(
      <Popover>
        <PopoverTrigger asChild>
          <button>HP</button>
        </PopoverTrigger>
        <PopoverContent rubric="Hit Points">
          <p>Damage / Heal / Temp</p>
        </PopoverContent>
      </Popover>
    );
    fireEvent.click(screen.getByRole("button", { name: "HP" }));
    expect(screen.getByText("Damage / Heal / Temp")).toBeInTheDocument();
    expect(screen.getByText("Hit Points")).toBeInTheDocument();
  });
});

describe("Dialog", () => {
  it("renders title/body/footer with an accessible name + close button", () => {
    render(
      <Dialog open>
        <DialogContent rubric="Add Spell" title="Choose a spell" closeLabel="Close">
          <DialogBody>
            <p>Pick from the SRD.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary">Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
    const dialog = screen.getByRole("dialog", { name: "Choose a spell" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Pick from the SRD.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});

// ─── RunicEmptyState ───────────────────────────────────────────────────────────

describe("RunicEmptyState", () => {
  it("renders glyph, title, blurb, and actions", () => {
    render(
      <RunicEmptyState
        glyph={BookOpen}
        eyebrow="Empty"
        title="Your folio awaits"
        blurb="Create a character to begin."
        actions={<Button>Create</Button>}
        note="Stored on this device + cloud"
      />
    );
    expect(
      screen.getByRole("heading", { name: "Your folio awaits" })
    ).toBeInTheDocument();
    expect(screen.getByText("Create a character to begin.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    expect(screen.getByText("Stored on this device + cloud")).toBeInTheDocument();
  });

  it("accepts a custom sigil color", () => {
    const { container } = render(
      <RunicEmptyState glyph={Sparkles} title="Empty spellbook" color="var(--sl-3)" />
    );
    const es = container.querySelector(".es") as HTMLElement;
    expect(es.style.getPropertyValue("--es-c")).toBe("var(--sl-3)");
  });
});
