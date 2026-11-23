/**
 * The refusal notice when a campaign-aware action cannot read the campaign (#1217,
 * Coordinator 2026-11-22, option (a); pattern: Google Docs «Trying to connect…» with
 * Reload). Slow read: the rules lane's «try again in a moment». Every read attempt failed:
 * say so plainly and offer Reload. Both languages.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { unreadNotice, useCampaignsReadStore } from "@/features/campaigns/campaigns-read";
import en from "@/i18n/en/ui/campaignContext.json";
import itCatalogue from "@/i18n/it/ui/campaignContext.json";

const t = (key: string): string => key;

beforeEach(() => {
  useCampaignsReadStore.setState({ failed: false });
});

describe("unreadNotice", () => {
  it("while the read is only slow, it asks to try again in a moment, with no action", () => {
    expect(unreadNotice(t)).toEqual({
      message: "campaignContext.unread",
      duration: 6000,
    });
  });

  it("once every read attempt failed, it says so and offers Reload", () => {
    useCampaignsReadStore.setState({ failed: true });
    const reload = vi.fn();
    const notice = unreadNotice(t, reload);
    expect(notice.message).toBe("campaignContext.failed");
    expect(notice.action?.label).toBe("campaignContext.reload");
    notice.action?.run();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("every key it uses exists in English and Italian", () => {
    for (const catalogue of [en, itCatalogue]) {
      const keys = Object.keys(catalogue.campaignContext);
      expect(keys).toEqual(expect.arrayContaining(["unread", "failed", "reload"]));
    }
  });
});
