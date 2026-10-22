// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Toasts } from "../components/toast";
import { FixtureData, sampleRecords } from "../data/fixtures";
import { type ChangeView, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";
import { ReviewActions } from "./review-actions";

const REVIEW = "20261020-evolucion-trimestre";

function viewOf(id: string): ChangeView {
  const found = deriveViews(sampleRecords(Date.now())).find((view) => view.id === id);
  if (found === undefined) throw new Error(`no sample ${id}`);
  return found;
}

@Component({
  imports: [ReviewActions],
  template: `<sp-review-actions [change]="change()" [compact]="compact()" />`,
})
class Host {
  readonly change = signal(viewOf(REVIEW));
  readonly compact = signal(false);
}

async function render() {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: SpectyData, useClass: FixtureData }] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const actions = () => element.querySelector<HTMLElement>("sp-review-actions");
  const buttons = () => [
    ...(actions()?.querySelectorAll<HTMLButtonElement>("sp-button button") ?? []),
  ];
  return { fixture, actions, buttons, host: fixture.componentInstance };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("ReviewActions", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("is an inline group, not a bar fixed to the bottom of the page (AC1)", async () => {
    const { actions, buttons } = await render();
    expect(actions()?.getAttribute("role")).toBe("group");
    expect(actions()?.getAttribute("aria-label")).toBe("Decisión sobre la spec");
    expect(actions()?.className).not.toMatch(/\b(fixed|sticky|bottom-0)\b/);
    expect(buttons().map(text)).toEqual(["Pedir cambios", "Aprobar revisión 2"]);
  });

  it("writes why approving waits below the buttons, and only in the tooltip when compact (AC1, AC2)", async () => {
    const { actions, buttons, fixture, host } = await render();
    expect(text(actions()?.querySelector("[data-blocked]"))).toBe(
      "Falta 1 supuesto de alto impacto por decidir.",
    );
    expect(buttons()[1]?.disabled).toBe(true);
    expect(buttons()[1]?.getAttribute("aria-disabled")).toBe("true");

    host.compact.set(true);
    await fixture.whenStable();
    expect(actions()?.hasAttribute("data-compact")).toBe(true);
    expect(actions()?.querySelector("[data-blocked]")).toBeNull();
    expect(buttons()[1]?.disabled).toBe(true);
    expect(buttons()[1]?.className).toContain("h-8");
  });

  it("requests changes and approves the revision it shows, telling so (AC2)", async () => {
    const { buttons, fixture, host } = await render();
    host.change.set({ ...viewOf(REVIEW), highImpactPending: 0 });
    await fixture.whenStable();
    expect(buttons()[1]?.disabled).toBe(false);
    buttons()[0]?.click();
    await fixture.whenStable();
    expect(TestBed.inject(Toasts).items().at(-1)?.text).toContain("Comentarios enviados");
    buttons()[1]?.click();
    await fixture.whenStable();
    expect(TestBed.inject(Toasts).items().at(-1)?.text).toBe("Revisión 2 aprobada.");
  });
});
