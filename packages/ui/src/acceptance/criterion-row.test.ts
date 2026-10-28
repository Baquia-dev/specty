// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { CriterionEvidence } from "../data/acceptance";
import { FixtureData, sampleRecords } from "../data/fixtures";
import { SpectyData } from "../data/records";
import { deriveViews } from "../data/views";
import { CriterionRow } from "./criterion-row";

const ASISTENCIA = "20261018-asistencia-curso";
const line = (n: number) => ({
  path: "test/panel_test.dart",
  line: n,
  task: "T2",
  commit: "8b0a4f6",
});
const BASE: CriterionEvidence = {
  id: "AC1",
  text: "Ve el porcentaje.",
  tasks: [],
  status: "uncovered",
};

@Component({
  imports: [CriterionRow],
  template: `<div role="list"><sp-criterion-row [evidence]="evidence()" [change]="change" /></div>`,
})
class Host {
  readonly evidence = signal<CriterionEvidence>({ ...BASE, tests: [1, 2, 3].map(line), more: 2 });
  readonly change = sampleView();
}

function sampleView() {
  const found = deriveViews(sampleRecords(Date.now())).find((view) => view.id === ASISTENCIA);
  if (found === undefined) throw new Error(`no sample ${ASISTENCIA}`);
  return found;
}

async function render() {
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: SpectyData, useClass: FixtureData }] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return { element, fixture, host: fixture.componentInstance };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("CriterionRow", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: lists the tests that carry its id, with their task and commit, and how many more", async () => {
    const { element } = await render();
    expect([...element.querySelectorAll("[data-test-line]")].map(text)).toEqual([
      "test/panel_test.dart:1 · T2 · 8b0a4f6",
      "test/panel_test.dart:2 · T2 · 8b0a4f6",
      "test/panel_test.dart:3 · T2 · 8b0a4f6",
    ]);
    expect(text(element.querySelector("[data-more]"))).toBe("y 2 más");
    expect(element.querySelector("[data-tests]")?.getAttribute("aria-label")).toBe("Tests de AC1");
  });

  it("AC1: says a manual criterion is checked by hand, and warns of one that owed a test", async () => {
    const { element, fixture, host } = await render();
    host.evidence.set({ ...BASE, tests: [], more: 0, manual: true });
    await fixture.whenStable();
    expect(text(element.querySelector("[data-manual]"))).toBe("A comprobar a mano");
    expect(element.querySelector("[data-untested], [data-tests]")).toBeNull();
    host.evidence.set({ ...BASE, tests: [], more: 0, untested: true });
    await fixture.whenStable();
    expect(text(element.querySelector("[data-untested]"))).toBe("Sin test con su id");
    expect(element.querySelector("[data-manual], [data-tests]")).toBeNull();
  });

  it("shows nothing about tests when the source does not know them", async () => {
    const { element, fixture, host } = await render();
    host.evidence.set(BASE);
    await fixture.whenStable();
    expect(element.querySelector("[data-tests], [data-manual], [data-untested]")).toBeNull();
  });
});
