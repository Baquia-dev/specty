// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Preferences } from "../theme/preferences";
import { UserRequest } from "./user-request";

@Component({
  imports: [UserRequest],
  template: `<sp-user-request [text]="text()" />`,
})
class Host {
  readonly text = signal("Quiero ver la evolución por trimestre.\nEl gráfico de ahora me sirve.");
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("UserRequest", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("quotes what the person asked for, word for word, apart from the Goal (AC2)", async () => {
    window.matchMedia = (() => ({
      matches: false,
      addEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    localStorage.setItem("specty.lang", "es");
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(text(element.querySelector("[data-request] p"))).toBe("Lo que pediste");
    const quote = element.querySelector("blockquote");
    expect(quote?.textContent).toBe(
      "«Quiero ver la evolución por trimestre.\nEl gráfico de ahora me sirve.»",
    );
    expect(element.querySelector("[data-request] svg")?.getAttribute("aria-hidden")).toBe("true");
    TestBed.inject(Preferences).lang.set("en");
    await fixture.whenStable();
    expect(text(element.querySelector("[data-request] p"))).toBe("What you asked for");
    expect(quote?.textContent?.startsWith("“")).toBe(true);
  });
});
