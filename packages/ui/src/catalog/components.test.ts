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

  it("shows the select with an example and its description, choosing for real (AC4)", async () => {
    const { fixture, element } = await render("es");
    const section = element.querySelector<HTMLElement>("[aria-labelledby=select]");
    expect(section?.querySelector("h2")?.textContent?.trim()).toBe("Select");
    expect(section?.querySelector("p")?.textContent).toContain("no el del sistema");
    const trigger = section?.querySelector<HTMLElement>("sp-select [data-select]");
    expect(trigger?.textContent?.trim()).toBe("Lo que más espera primero");
    trigger?.click();
    await fixture.whenStable();
    document.querySelectorAll<HTMLElement>("[role=option]")[1]?.click();
    await fixture.whenStable();
    expect(section?.querySelector("[data-chosen]")?.textContent?.trim()).toBe(
      "Elegido: Lo más reciente primero",
    );
    TestBed.resetTestingModule();
  });

  it("shows the segmented control with its description and examples that choose (AC5)", async () => {
    const { fixture, element } = await render("es");
    const section = element.querySelector<HTMLElement>("[aria-labelledby=segmented]");
    expect(section?.querySelector("h2")?.textContent?.trim()).toBe("Selector segmentado");
    expect(section?.querySelector("p")?.textContent).toContain("mejor el select");
    const groups = [...(section?.querySelectorAll("[role=radiogroup]") ?? [])];
    expect(groups).toHaveLength(2);
    const chosen = () => section?.querySelector("[data-segmented-chosen]")?.textContent?.trim();
    expect(chosen()).toBe("Elegido: Unificado · Todo el cambio");
    section?.querySelector<HTMLElement>("sp-segmented [data-value=split]")?.click();
    section?.querySelector<HTMLElement>("sp-segmented [data-value=T2]")?.click();
    await fixture.whenStable();
    expect(chosen()).toBe("Elegido: Lado a lado · T2 · Panel con estudiantes destacados");
    TestBed.resetTestingModule();
  });

  it("shows the diff viewer with the sample diff and which changes to see (AC6)", async () => {
    const { fixture, element } = await render("es");
    const section = element.querySelector<HTMLElement>("[aria-labelledby=diff-viewer]");
    expect(section?.querySelector("h2")?.textContent?.trim()).toBe("Visor de diffs");
    expect(section?.querySelector("p")?.textContent).toContain("unificado o lado a lado");
    const summary = () => section?.querySelector("[data-summary]")?.textContent ?? "";
    const files = () =>
      [...(section?.querySelectorAll("sp-diff-file") ?? [])].map((file) =>
        file.getAttribute("data-file"),
      );
    expect(summary()).toContain("5d2a7b0 → 8b0a4f6 · 4 archivos");
    expect(files()).toHaveLength(4);
    section?.querySelector<HTMLElement>("[data-diff-scope] [data-value=T2]")?.click();
    await fixture.whenStable();
    expect(summary()).toContain("3c9d1e2 → 8b0a4f6 · 2 archivos");
    expect(files()).toEqual([
      "lib/attendance/course_panel.dart",
      "test/attendance/course_panel_test.dart",
    ]);
    TestBed.resetTestingModule();
  });

  it("follows the language (AC9)", async () => {
    const { element } = await render("en");
    expect(element.querySelector("h1")?.textContent).toContain("Components");
    expect(element.textContent).toContain("2 high-impact assumptions are still undecided.");
  });
});
