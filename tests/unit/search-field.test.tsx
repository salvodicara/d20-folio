/**
 * A search field (#1436) shows the search icon inside the box and its hint as the
 * placeholder, so it reads as a search at a glance; the label stays for screen readers
 * and for the eye.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "@/ui";

describe("Field type=search", () => {
  it("draws the search icon and keeps the hint as the placeholder", () => {
    const { container } = render(
      <Field
        label="Search"
        type="search"
        placeholder="Name or type"
        value=""
        onChange={() => undefined}
      />
    );
    const input = screen.getByRole("searchbox", { name: "Search" });
    expect(input.getAttribute("placeholder")).toBe("Name or type");
    const icon = container.querySelector(".f-in-search use");
    expect(icon?.getAttribute("href")).toMatch(/#u-search$/);
  });

  it("a plain field has no icon", () => {
    const { container } = render(
      <Field label="Name" value="" onChange={() => undefined} />
    );
    expect(container.querySelector(".f-in-search")).toBeNull();
  });
});
