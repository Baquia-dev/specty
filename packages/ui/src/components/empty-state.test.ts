// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { LucideSearchX } from "@lucide/angular";
import { EmptyState } from "./empty-state";

@Component({
  imports: [EmptyState],
  template: `
    <sp-empty-state heading="Ningún cambio coincide" [icon]="icon" [level]="level()">
      <p>Prueba con otro texto.</p>
      <button type="button">Limpiar filtros</button>
    </sp-empty-state>
  `,
})
class Host {
  readonly icon = LucideSearchX;
  readonly level = signal<1 | 2>(2);
}

describe("EmptyState", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("says there is nothing to show, what happened and the way on, as a status (AC2)", async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const state = element.querySelector("sp-empty-state");
    expect(state?.getAttribute("role")).toBe("status");
    expect(state?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(state?.querySelector("h2")?.textContent).toBe("Ningún cambio coincide");
    expect(state?.querySelector("p")?.textContent).toBe("Prueba con otro texto.");
    expect(state?.querySelector("button")?.textContent).toBe("Limpiar filtros");

    // As the whole page, its title is the page's.
    fixture.componentInstance.level.set(1);
    await fixture.whenStable();
    expect(state?.querySelector("h1")?.textContent).toBe("Ningún cambio coincide");
    expect(state?.querySelector("h2")).toBeNull();
  });
});
