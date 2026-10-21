// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { Foundations, Typography } from "./foundations";

describe("catalog pages", () => {
  beforeEach(() => {
    window.matchMedia = (() => ({
      matches: false,
      addEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    localStorage.setItem("specty.lang", "en");
    TestBed.resetTestingModule();
  });

  it("samples both families and every size on Typography", async () => {
    const fixture = TestBed.createComponent(Typography);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector("h1")?.textContent).toContain("Typography");
    expect(element.querySelectorAll("li")).toHaveLength(9);
    expect(element.textContent).toContain("AC1 T11 0O 1lI");
  });

  it("toggles the motion sample on Foundations", async () => {
    const fixture = TestBed.createComponent(Foundations);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const button = element.querySelector("button");
    expect(button?.getAttribute("aria-pressed")).toBe("false");

    button?.click();
    await fixture.whenStable();
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    expect(element.textContent).toContain("--duration-base");
  });
});
