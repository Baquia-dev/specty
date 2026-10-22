// SPDX-License-Identifier: Apache-2.0
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FixtureData, sampleRecords } from "../data/fixtures";
import { SpectyData } from "../data/records";
import { deriveViews } from "../data/views";
import { ReviewActions } from "./review-actions";

const CHANGE = deriveViews(sampleRecords(Date.now())).find(
  (view) => view.id === "20261020-evolucion-trimestre",
);

@Component({
  imports: [ReviewActions],
  template: `
    <div data-scroller style="overflow-y: auto">
      @if (change; as change) {
        <sp-review-actions [change]="change" />
      }
    </div>
  `,
})
class Host {
  readonly change = CHANGE;
}

describe("ReviewActions", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    Reflect.deleteProperty(window, "ResizeObserver");
  });

  it("spans the whole scrolling area, fixed at the bottom like a navigation bar (AC4)", async () => {
    const resized: ResizeObserverCallback[] = [];
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resized.push(callback);
      }
      observe(): void {}
      disconnect(): void {}
    }
    Object.assign(window, { ResizeObserver: FakeResizeObserver });
    window.matchMedia = (() => ({
      matches: false,
      addEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    localStorage.setItem("specty.lang", "es");
    TestBed.configureTestingModule({ providers: [{ provide: SpectyData, useClass: FixtureData }] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const bar = element.querySelector<HTMLElement>("sp-review-actions");
    expect(bar?.getAttribute("role")).toBe("region");
    expect(bar?.className.split(" ")).toEqual(
      expect.arrayContaining(["fixed", "inset-x-0", "bottom-0", "border-t", "backdrop-blur"]),
    );
    // Its content lines up with the page's column.
    expect(bar?.firstElementChild?.className).toContain("max-w-6xl");
    expect(bar?.querySelectorAll("sp-button")).toHaveLength(2);

    // Over the scrolling area only: its left edge, and its width without the scrollbar.
    const scroller = element.querySelector<HTMLElement>("[data-scroller]");
    if (scroller === null) throw new Error("no scroller");
    scroller.getBoundingClientRect = () => ({ left: 240 }) as DOMRect;
    Object.defineProperty(scroller, "clientWidth", { value: 1025, configurable: true });
    for (const callback of resized) callback([], {} as ResizeObserver);
    await fixture.whenStable();
    expect(bar?.style.left).toBe("240px");
    expect(bar?.style.width).toBe("1025px");
  });
});
