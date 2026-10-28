// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { TestsView } from "../data/tests";
import { TestsSent } from "./tests-sent";

const NOW = Date.parse("2026-10-28T10:05:00.000Z");

const SENT: TestsView = {
  submittedAt: "2026-10-28T10:00:00.000Z",
  files: ["test/justificante_test.dart", "test/aviso_test.dart"],
  red: [
    { cmd: "flutter test", exit: 1 },
    { cmd: "flutter test integration_test", exit: null },
  ],
};

@Component({
  imports: [TestsSent],
  template: `<sp-tests-sent [tests]="tests()" [now]="now" />`,
})
class Host {
  readonly tests = signal<TestsView>(SENT);
  readonly now = NOW;
}

async function render(lang = "es") {
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return { fixture, element, host: fixture.componentInstance };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("TestsSent", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC2: lists each new test by its path, each failing command with its exit and what approving means", async () => {
    const { element } = await render();
    expect(text(element.querySelector("h2"))).toBe("Tests por aprobar");
    expect(text(element.querySelector("[data-sent]"))).toBe(
      "El agente los envió hace 5 min. Fallan, como deben antes del código.",
    );
    expect([...element.querySelectorAll("[data-test]")].map(text)).toEqual([
      "test/justificante_test.dart",
      "test/aviso_test.dart",
    ]);
    expect([...element.querySelectorAll("[data-red]")].map(text)).toEqual([
      "flutter test falla · salida 1",
      "flutter test integration_test no terminó",
    ]);
    expect(text(element.querySelector("[data-meaning]"))).toBe(
      "Al aprobarlos quedan bloqueados: el agente ya no puede cambiarlos ni borrarlos sin que lo decidas, y escribe el código que los pone en verde.",
    );
    expect(element.querySelector("[data-writing]")).toBeNull();
  });

  it("AC2: while the agent writes them, says so and lists nothing", async () => {
    const { element, fixture, host } = await render();
    host.tests.set({ files: [], red: [] });
    await fixture.whenStable();
    expect(text(element.querySelector("h2"))).toBe("Tests");
    expect(text(element.querySelector("[data-writing]"))).toBe(
      "El agente escribe los tests de los criterios, antes del código. Cuando los envíe, aquí verás cada test nuevo y la verificación que falla.",
    );
    expect(element.querySelectorAll("[data-test], [data-red], [data-meaning]")).toHaveLength(0);
  });

  it("says it in English", async () => {
    const { element } = await render("en");
    expect(text(element.querySelector("h2"))).toBe("Tests to approve");
    expect([...element.querySelectorAll("[data-red]")].map(text)).toEqual([
      "flutter test fails · exit 1",
      "flutter test integration_test did not finish",
    ]);
  });
});
