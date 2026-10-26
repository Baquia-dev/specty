// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { ReviewRecord } from "../data/records";
import { IndependentReview } from "./independent-review";

const REVIEW: ReviewRecord = {
  target: "diff",
  revision: 2,
  at: "2026-10-24T10:00:00.000Z",
  text: "T2 no comprueba el error.\nRevisa la caché <b>antes</b>.",
};

@Component({
  imports: [IndependentReview],
  template: `<sp-independent-review [review]="review()" />`,
})
class Host {
  readonly review = signal(REVIEW);
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("IndependentReview", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("shows what the reviewer said, as plain text, with its revision (AC2, AC3)", async () => {
    window.matchMedia = (() => ({
      matches: false,
      addEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    localStorage.setItem("specty.lang", "es");
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(text(element.querySelector("h2"))).toContain("Revisión independiente del resultado");
    expect(text(element.querySelector("[data-review] > p"))).toContain("decides tú");
    expect(text(element.querySelector("[data-review-meta]"))).toContain("Revisión 2");
    // As it came: the markup is text, not HTML.
    const body = element.querySelector("[data-review-text]");
    expect(body?.textContent).toBe(REVIEW.text);
    expect(body?.querySelector("b")).toBeNull();
    fixture.componentInstance.review.set({ ...REVIEW, target: "spec", revision: 1 });
    await fixture.whenStable();
    expect(text(element.querySelector("h2"))).toContain("Revisión independiente de la spec");
    expect(text(element.querySelector("[data-review-meta]"))).toContain("Revisión 1");
  });
});
