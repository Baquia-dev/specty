// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { PHASES } from "@baquia-dev/specty-core";
import { Components } from "./components";

async function render(lang: "es" | "en") {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Components);
  await fixture.whenStable();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe("Components page", () => {
  it("shows every component with its states (AC9)", async () => {
    const { fixture, element } = await render("es");
    expect(element.querySelector("h1")?.textContent).toContain("Componentes");
    expect(element.querySelectorAll("sp-phase-badge").length).toBeGreaterThanOrEqual(PHASES.length);
    for (const selector of ["sp-badge", "sp-kbd", "sp-icon-button", "sp-tooltip", "textarea"]) {
      expect(element.querySelector(selector), selector).not.toBeNull();
    }
    expect(element.querySelector("sp-card[aria-current=true]")).not.toBeNull();
    expect(element.querySelector("[aria-invalid=true]")).not.toBeNull();
    expect(element.querySelector("[role=status]")).not.toBeNull();

    const disabled = element.querySelector<HTMLButtonElement>("#disabled-example button");
    expect(disabled?.disabled).toBe(true);
    expect(element.querySelector("#disabled-example [role=tooltip]")?.textContent).toContain(
      "supuestos de alto impacto",
    );

    const approve = element.querySelector<HTMLButtonElement>("sp-button button");
    approve?.click();
    await fixture.whenStable();
    expect(element.textContent).toContain("Pulsaciones: 1");
  });

  it("follows the language (AC9)", async () => {
    const { element } = await render("en");
    expect(element.querySelector("h1")?.textContent).toContain("Components");
    expect(element.textContent).toContain("2 high-impact assumptions are still undecided.");
  });
});
