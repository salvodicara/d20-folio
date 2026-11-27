/**
 * The campaign banner's cropper on the new screen: a 16:9 frame to drag, a zoom slider,
 * a live preview of the header's crest, «Salva» / «Annulla», and removing the picture.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { BannerCropDialog } from "@/domains/campaign/ui/BannerCropDialog";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});

const size = { width: 3200, height: 1200 };

describe("the banner cropper", () => {
  it("«Save» gives back the framed rectangle; the slider zooms it", () => {
    const onSave = vi.fn();
    render(
      <BannerCropDialog
        src="/banner.jpg"
        initialCrop={null}
        imageSize={size}
        onSave={onSave}
        onCancel={() => {}}
      />
    );
    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const crop = onSave.mock.calls[0]?.[0] as { height: number };
    expect(crop.height).toBeCloseTo(50);
  });

  it("«Cancel» leaves it as it was", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <BannerCropDialog
        src="/banner.jpg"
        initialCrop={null}
        imageSize={size}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("a picture already set can be removed", () => {
    const onRemove = vi.fn();
    render(
      <BannerCropDialog
        src="/banner.jpg"
        initialCrop={null}
        imageSize={size}
        onSave={() => {}}
        onCancel={() => {}}
        onRemove={onRemove}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove the picture" }));
    expect(onRemove).toHaveBeenCalled();
  });

  it("shows how the header's crest will look", () => {
    render(
      <BannerCropDialog
        src="/banner.jpg"
        initialCrop={null}
        imageSize={size}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    expect(
      screen.getByRole("img", { name: "Preview of the campaign crest" })
    ).toBeInTheDocument();
  });
});
