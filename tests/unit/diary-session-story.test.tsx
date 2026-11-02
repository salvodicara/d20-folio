/**
 * The Diario's «Cronaca della sessione» (approved prototype camp-diary / camp-diary-new):
 * the evening's own text lives on its play log and is saved there with
 * `saveSessionNotes` (explicit Save, the whole text). An old evening without it shows the
 * legacy session page's text read-only; a failed save keeps what was typed and says so.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/session-log-source", () => ({
  saveSessionNotes: vi.fn(() => Promise.resolve()),
}));

import { SessionStory } from "@/domains/chronicle/ui/SessionStory";
import { saveSessionNotes } from "@/features/campaigns/session-log-source";

const save = vi.mocked(saveSessionNotes);

function story(props: Partial<Parameters<typeof SessionStory>[0]> = {}) {
  const onSaved = vi.fn();
  render(
    <SessionStory
      campaignId="c1"
      logId="2026-10-23"
      onSaved={onSaved}
      onCopyReport={vi.fn()}
      {...props}
    />
  );
  return { onSaved };
}

beforeEach(() => vi.clearAllMocks());

describe("SessionStory", () => {
  it("pasting the chronicle saves it on the evening's play log and shows it", async () => {
    const { onSaved } = story();
    fireEvent.click(screen.getByRole("button", { name: /paste the chronicle/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /session chronicle/i }), {
      target: { value: "Rain on the crypt windows." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith("c1", "2026-10-23", "Rain on the crypt windows.");
    expect(screen.getByText("Rain on the crypt windows.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("the evening's own text wins over the old session page's", () => {
    story({ notes: "From the play log.", legacy: "From the old page." });
    expect(screen.getByText("From the play log.")).toBeInTheDocument();
    expect(screen.queryByText("From the old page.")).not.toBeInTheDocument();
  });

  it("an old evening shows the old page's text; editing it saves to the play log, never the old page", async () => {
    story({ legacy: "From the old page." });
    expect(screen.getByText("From the old page.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(screen.getByRole("textbox", { name: /session chronicle/i })).toHaveValue(
      "From the old page."
    );
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith("c1", "2026-10-23", "From the old page.")
    );
  });

  it("a failed save keeps what was typed and says it was not saved", async () => {
    save.mockRejectedValueOnce(new Error("permission-denied"));
    const { onSaved } = story({ notes: "Old text." });
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    const box = screen.getByRole("textbox", { name: /session chronicle/i });
    fireEvent.change(box, { target: { value: "New text." } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByText(/not saved/i)).toBeInTheDocument();
    expect(box).toHaveValue("New text.");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("Cancel leaves the text as it was, saving nothing", () => {
    story({ notes: "Old text." });
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Changed." } });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.getByText("Old text.")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});
