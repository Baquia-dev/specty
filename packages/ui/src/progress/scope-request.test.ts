// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FixtureData } from "../data/fixtures";
import type { TaskScopeRequest } from "../data/progress";
import { SpectyData } from "../data/records";
import { ScopeRequest } from "./scope-request";

const TEST = "test/sesion_test.dart";

@Component({
  imports: [ScopeRequest],
  template: `<sp-scope-request change="20261021-login-google" task="T2" [request]="request()" />`,
})
class Host {
  readonly request = signal<TaskScopeRequest>({
    id: "S2",
    paths: [TEST, "lib/auth/session.dart"],
    reason: "El test esperaba el mensaje antiguo.",
    unlocks: [TEST],
  });
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

describe("ScopeRequest", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC2: a request to unlock an approved test says so, marks it and says what approving means", async () => {
    const { element } = await render();
    expect(text(element.querySelector("[data-heading]"))).toBe("S2 · Desbloquear un test aprobado");
    expect([...element.querySelectorAll("[data-unlock]")].map(text)).toEqual(["(test aprobado)"]);
    expect(text(element.querySelector("[data-means]"))).toBe(
      "Si la apruebas, T2 podrá cambiar este test aprobado y vuelve a bloquearse al terminarla. Solo lo decides tú: el agente no puede aprobarlo, ni en modo delegado. Si la rechazas, el agente sigue sin él y lee tu motivo.",
    );
  });

  it("keeps a plain widening as it was", async () => {
    const { element, fixture, host } = await render();
    host.request.set({ id: "S1", paths: ["lib/app.dart"], reason: "La firma." });
    await fixture.whenStable();
    expect(text(element.querySelector("[data-heading]"))).toBe("S1 · Solicitud de alcance");
    expect(element.querySelector("[data-unlock]")).toBeNull();
    expect(text(element.querySelector("[data-means]"))).toBe(
      "Si la apruebas, T2 podrá tocarlo y entra en su alcance. Si la rechazas, el agente sigue sin él y lee tu motivo.",
    );
  });
});
