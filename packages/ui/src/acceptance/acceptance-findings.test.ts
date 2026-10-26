// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { FindingView } from "../data/records";
import { AcceptanceFindings } from "./acceptance-findings";

const FINDINGS: readonly FindingView[] = [
  { task: "T1", text: "La caché no se invalida al cambiar de curso." },
  { task: "T2", text: "Falta un índice en notas." },
];

@Component({
  imports: [AcceptanceFindings],
  template: `<sp-acceptance-findings [findings]="findings()" />`,
})
class Host {
  readonly findings = signal(FINDINGS);
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("AcceptanceFindings", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("lists what each task learned, and says the closing takes it to its follow-ups (AC1)", async () => {
    window.matchMedia = (() => ({
      matches: false,
      addEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    localStorage.setItem("specty.lang", "es");
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(text(element.querySelector("h2"))).toContain("Hallazgos");
    expect(text(element.querySelector("[data-findings] > p"))).toContain("Pendientes");
    const rows = [...element.querySelectorAll("li")];
    expect(
      rows.map((row) => [text(row.querySelector("span")), text(row.querySelector("p"))]),
    ).toEqual([
      ["T1", "La caché no se invalida al cambiar de curso."],
      ["T2", "Falta un índice en notas."],
    ]);
  });
});
