// SPDX-License-Identifier: Apache-2.0
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { EdgeFade } from "./edge-fade";

@Component({
  imports: [EdgeFade],
  template: `<div spEdgeFade data-row><span>Borrador</span><span>Revisión</span></div>`,
})
class Host {}

/** A row `width` wide showing `visible` of it, scrolled as `scrolled()` says: jsdom lays out nothing. */
async function row(width: number, visible: number, scrolled: () => number) {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  const element = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>("[data-row]");
  if (element === null) throw new Error("no row");
  Object.defineProperties(element, {
    scrollWidth: { value: width, configurable: true },
    clientWidth: { value: visible, configurable: true },
    scrollLeft: { get: scrolled, configurable: true },
  });
  await fixture.whenStable();
  const edges = () => [
    element.hasAttribute("data-fade-start"),
    element.hasAttribute("data-fade-end"),
  ];
  return { element, edges };
}

describe("EdgeFade", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("fades the edges where more of the row hides, as it scrolls (AC1)", async () => {
    let left = 0;
    const { element, edges } = await row(300, 100, () => left);
    expect(edges()).toEqual([false, true]);
    left = 100;
    element.dispatchEvent(new Event("scroll"));
    expect(edges()).toEqual([true, true]);
    left = 200;
    element.dispatchEvent(new Event("scroll"));
    expect(edges()).toEqual([true, false]);
  });

  it("fades nothing when all of the row fits (AC1)", async () => {
    const { edges } = await row(100, 100, () => 0);
    expect(edges()).toEqual([false, false]);
  });
});
