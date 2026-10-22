// SPDX-License-Identifier: Apache-2.0
import { Component, computed, Injectable, inject, input } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Toasts } from "../components/toast";
import { ChangesStore, DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { ActionError, type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";
import { ProgressTab } from "./progress-tab";

const PDF = "20261019-boletines-pdf";

@Component({
  imports: [ProgressTab],
  template: `@if (change(); as change) { <sp-progress-tab [change]="change" /> }`,
})
class Host {
  readonly id = input(PDF);
  private readonly store = inject(ChangesStore);
  readonly change = computed(() => this.store.all().find((view) => view.id === this.id()));
}

/** A source that cannot decide: the tab explains why. */
@Injectable()
class Refusing extends FixtureData {
  override decideScope(): Promise<void> {
    return Promise.reject(
      new ActionError({ es: "El servidor no responde.", en: "The server does not answer." }),
    );
  }
}

async function render(id = PDF, source: typeof FixtureData = FixtureData) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SpectyData, useClass: source },
      {
        provide: DERIVER,
        useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
      },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentRef.setInput("id", id);
  const store = TestBed.inject(ChangesStore);
  const settle = async () => {
    for (let round = 0; round < 60; round++) {
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve));
      if (!store.views.isLoading()) break;
    }
    await fixture.whenStable();
  };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  const section = (name: "waiting" | "tasks") =>
    element.querySelector<HTMLElement>(`[data-${name}]`);
  const rows = (name: "waiting" | "tasks") =>
    [...(section(name)?.querySelectorAll<HTMLElement>("sp-task-row") ?? [])].map(
      (row) => row.dataset.task,
    );
  const row = (id: string) => element.querySelector<HTMLElement>(`sp-task-row[data-task=${id}]`);
  const toasts = () =>
    TestBed.inject(Toasts)
      .items()
      .map((item) => item.text);
  return { fixture, element, settle, section, rows, row, toasts };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("Progress tab", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("lists the tasks in order as document rows, with a summary and a bar per task (AC1)", async () => {
    const { element, rows, row } = await render();
    expect(text(element.querySelector("[data-summary]"))).toMatch(
      /^2 de 3 tareas hechas · \d+ min de trabajo · 1 decisión te espera$/,
    );
    expect(element.querySelectorAll("[data-bar] span")).toHaveLength(3);
    expect(rows("tasks")).toEqual(["T1", "T2"]);
    const first = row("T1");
    expect(first?.getAttribute("role")).toBe("listitem");
    expect(text(first?.querySelector("[data-summary]"))).toBe(
      "Plantilla del boletín con notas, promedios y observaciones.",
    );
    expect(text(first?.querySelector("[data-meta]"))).toBe(
      "commit a1b2c3d lib/reports/pdf/report_card.dart AC1 14 min",
    );
    expect(text(first?.querySelector("[data-mark]"))).toBe("Hecha");
    expect(text(row("T2")?.querySelector("[data-attempts]"))).toBe("2 intentos");
  });

  it("shows each task's last verification; a failure's lines open on the task in progress (AC2)", async () => {
    const { fixture, row } = await render();
    const verification = (id: string) => row(id)?.querySelector("[data-verification]");
    expect(text(verification("T1"))).toBe("Verificación correcta · 18 s flutter test test/reports");
    expect(verification("T1")?.querySelector("button")).toBeNull();
    expect(text(verification("T2"))).toContain("Verificación correcta · 9 s");
    expect(text(verification("T3"))).toMatch(/^Falló hace 4 min · 7 s flutter test test\/reports/);
    expect(text(row("T3")?.querySelector("[data-output]"))).toContain("Some tests failed.");
    const toggle = verification("T3")?.querySelector<HTMLButtonElement>("button");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    toggle?.click();
    await fixture.whenStable();
    expect(row("T3")?.querySelector("[data-output]")).toBeNull();
    expect(toggle?.textContent?.trim()).toBe("Ver salida");
  });

  it("puts the task waiting for a decision at the top, and back in its place once approved (AC3, AC4)", async () => {
    const { element, settle, rows, row, toasts } = await render();
    expect(rows("waiting")).toEqual(["T3"]);
    const request = row("T3")?.querySelector("[data-scope-request]");
    expect(text(request)).toContain(
      "T3 pide lib/shared/pdf/layout.dart: «La firma necesita el maquetador compartido.»",
    );
    expect(text(request)).toContain("Si la apruebas, T3 podrá tocarlo y entra en su alcance.");
    request?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    await settle();
    expect(element.querySelector("[data-waiting]")).toBeNull();
    expect(rows("tasks")).toEqual(["T1", "T2", "T3"]);
    expect(text(element.querySelector("[data-summary]"))).not.toContain("decisión");
    expect(toasts()).toContain("Aprobaste S1: T3 vuelve a su lugar.");
  });

  it("asks for the reason before rejecting, and the task goes back too (AC3)", async () => {
    const { settle, rows, row, toasts } = await render();
    const buttons = row("T3")?.querySelectorAll<HTMLButtonElement>(
      "[data-scope-request] sp-button button",
    );
    buttons?.[1]?.click();
    await settle();
    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    expect(text(dialog?.querySelector("h2"))).toBe("Rechazar S1");
    const confirm = () =>
      [...(dialog?.querySelectorAll<HTMLButtonElement>("sp-button button") ?? [])].at(-1);
    expect(confirm()?.disabled).toBe(true);
    const reason = dialog?.querySelector("textarea");
    if (reason === null || reason === undefined) throw new Error("no reason field");
    reason.value = "Usa el maquetador propio del boletín.";
    reason.dispatchEvent(new Event("input"));
    await settle();
    confirm()?.click();
    await settle();
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(rows("tasks")).toEqual(["T1", "T2", "T3"]);
    expect(toasts()).toContain("Rechazaste S1.");
  });

  it("explains it when the source cannot decide (AC4)", async () => {
    const { settle, rows, row, toasts } = await render(PDF, Refusing);
    row("T3")?.querySelector<HTMLButtonElement>("[data-scope-request] sp-button button")?.click();
    await settle();
    expect(toasts()).toContain("El servidor no responde.");
    expect(rows("waiting")).toEqual(["T3"]);
  });

  it("says so when the change has no tasks yet (AC5)", async () => {
    const { element } = await render("20261021-modo-oscuro");
    expect(text(element.querySelector("sp-empty-state h2"))).toBe("Aún no hay tareas");
    expect(element.querySelector("[data-tasks]")).toBeNull();
  });

  it("shows when the task in progress started, with no verification before its first run", async () => {
    const { row } = await render("20261021-login-google");
    const active = row("T2");
    expect(active?.dataset.status).toBe("active");
    expect(text(active?.querySelector("[data-running]"))).toBe("En curso · empezó hace 25 min");
    expect(active?.querySelector("[data-verification]")).toBeNull();
    expect(text(active?.querySelector("[data-mark]"))).toBe("En curso");
  });
});
