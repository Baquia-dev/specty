// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Toasts } from "../components/toast";
import { FixtureData, sampleRecords } from "../data/fixtures";
import { type ChangeRecord, type ChangeView, SpectyData } from "../data/records";
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

/** A source with no actions of its own: nobody decides here. */
class ReadOnly extends SpectyData {
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([]);
  }
  subscribe(): () => void {
    return () => undefined;
  }
}

async function render(source: new () => SpectyData = FixtureData) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: SpectyData, useClass: source }] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  // The source says once whether the person may decide here.
  await new Promise((done) => setTimeout(done));
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

  it("offers no decision on a read-only server, and says why (AC2)", async () => {
    const { actions, buttons, fixture, host } = await render(ReadOnly);
    host.change.set({ ...viewOf(REVIEW), highImpactPending: 0 });
    await fixture.whenStable();
    expect(buttons().map((button) => button.disabled)).toEqual([true, true]);
    expect(text(actions()?.querySelector("[data-blocked]"))).toBe(
      "Esta fuente de datos es de solo lectura: no admite acciones.",
    );
  });

  it("says the agent prepares the next revision once changes were asked for (AC2)", async () => {
    const { actions, buttons, fixture, host } = await render();
    const asked = { revision: 2, at: "2026-10-24T10:00:00Z" };
    const base = viewOf(REVIEW);
    host.change.set({
      ...base,
      highImpactPending: 0,
      changesRequested: asked,
      review: { ...base.review, comments: [] },
    });
    await fixture.whenStable();
    expect(text(actions()?.querySelector("[data-requested]"))).toBe(
      "Cambios pedidos: el agente prepara la revisión 3.",
    );
    expect(buttons().map((button) => button.disabled)).toEqual([true, false]);
  });

  it("requests changes and approves the revision it shows, telling so (AC2)", async () => {
    const { buttons, fixture, host } = await render();
    const base = viewOf(REVIEW);
    // Con comentarios abiertos se pueden pedir cambios
    host.change.set({ ...base, highImpactPending: 0 });
    await fixture.whenStable();
    buttons()[0]?.click();
    await fixture.whenStable();
    expect(TestBed.inject(Toasts).items().at(-1)?.text).toContain("Comentarios enviados");

    // Sin comentarios pendientes se puede aprobar
    host.change.set({ ...base, highImpactPending: 0, review: { ...base.review, comments: [] } });
    await fixture.whenStable();
    expect(buttons()[1]?.disabled).toBe(false);
    buttons()[1]?.click();
    await fixture.whenStable();
    expect(TestBed.inject(Toasts).items().at(-1)?.text).toBe("Revisión 2 aprobada.");
  });

  it("AC5: disables approve button and allows requesting changes when open comments exist", async () => {
    const { actions, buttons, fixture, host } = await render();
    const view = viewOf(REVIEW);
    host.change.set({
      ...view,
      highImpactPending: 0,
      review: {
        ...view.review,
        comments: [
          {
            id: "c1",
            revision: 2,
            anchor: { item: "A1" },
            author: "User",
            body: "Revisar",
            createdAt: new Date().toISOString(),
            resolved: false,
            section: "assumptions",
          },
        ],
      },
    });
    await fixture.whenStable();
    expect(buttons()[1]?.disabled).toBe(true);
    expect(text(actions()?.querySelector("[data-blocked]"))).toContain("comentario");
    expect(buttons()[0]?.disabled).toBe(false);
  });
});
