// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { LIST, PAGE, REVEAL, ROW, SectionDivider } from "./document";

@Component({
  imports: [SectionDivider],
  template: `<sp-section-divider [heading]="heading" headingId="delta-criteria" [meta]="meta()" [level]="level()" />`,
})
class Host {
  readonly heading = "Criterios";
  readonly meta = signal<string | number>(2);
  readonly level = signal<2 | 3>(3);
}

describe("SectionDivider", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("opens a section with its title, a hairline and a count (AC1)", async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const heading = element.querySelector("h3");
    expect(heading?.textContent).toBe("Criterios");
    expect(heading?.id).toBe("delta-criteria");
    expect(heading?.className).toContain("uppercase");
    expect(element.querySelector("[aria-hidden=true]")?.className).toContain("h-px");
    expect(element.querySelector("[data-meta]")?.textContent).toBe("2");

    fixture.componentInstance.level.set(2);
    fixture.componentInstance.meta.set("");
    await fixture.whenStable();
    expect(element.querySelector("h2")?.textContent).toBe("Criterios");
    expect(element.querySelector("h3")).toBeNull();
    expect(element.querySelector("[data-meta]")).toBeNull();
  });
});

describe("document patterns", () => {
  it("rows have no lines and light up under the pointer or with focus inside (AC1)", () => {
    expect(ROW).not.toMatch(/\bborder-[bt]\b/);
    expect(ROW.split(" ")).toEqual(
      expect.arrayContaining(["group", "hover:bg-text/4", "focus-within:bg-text/4"]),
    );
    expect(REVEAL).toContain("group-hover:opacity-100");
    expect(REVEAL).toContain("group-focus-within:opacity-100");
  });

  it("on a phone, rows put the id and marks on one line and the content below (AC5)", () => {
    expect(ROW.split(" ")).toEqual(
      expect.arrayContaining([
        "grid-cols-[minmax(0,1fr)_auto]",
        "max-sm:[&>:nth-child(2)]:col-span-2",
        "max-sm:[&>:nth-child(2)]:row-start-2",
        "sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]",
      ]),
    );
  });

  it("on a touch screen, a row's actions always show (AC6)", () => {
    expect(REVEAL.split(" ")).toContain("pointer-coarse:opacity-100");
  });

  it("lists are indented under their section, and pages share one width (AC1)", () => {
    expect(LIST.split(" ")).toContain("pl-6");
    expect(LIST).not.toMatch(/\bborder\b/);
    expect(PAGE.split(" ")).toEqual(expect.arrayContaining(["max-w-6xl", "px-6", "mx-auto"]));
  });
});
