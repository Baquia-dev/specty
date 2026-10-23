// SPDX-License-Identifier: Apache-2.0
import { Component, computed, Injectable, inject, input } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Toasts } from "../components/toast";
import { ChangesStore, DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { ActionError, type ChangeRecord, SpectyData } from "../data/records";
import { STEP_MS } from "../data/sample-run";
import { deriveViews } from "../data/views";
import { AcceptanceActions, ResultDialogs } from "./acceptance-actions";

const ASISTENCIA = "20261018-asistencia-curso";

@Component({
  imports: [AcceptanceActions],
  template: `@if (change(); as change) { <sp-acceptance-actions [change]="change" [compact]="compact()" /> }`,
})
class Host {
  readonly id = input(ASISTENCIA);
  readonly compact = input(false);
  /** As a project with no `verify.full` would see it. */
  readonly unconfigured = input(false);
  private readonly store = inject(ChangesStore);
  readonly change = computed(() => {
    const view = this.store.all().find((item) => item.id === this.id());
    if (view === undefined || !this.unconfigured()) return view;
    return { ...view, progress: { tasks: view.progress.tasks } };
  });
}

/** A source that cannot decide: the dialog stays and a notice says why. */
@Injectable()
class Refusing extends FixtureData {
  override decideResult(): Promise<void> {
    return Promise.reject(
      new ActionError({ es: "El servidor no responde.", en: "The server does not answer." }),
    );
  }
}

async function render(source: typeof FixtureData = FixtureData, compact = false, bare = false) {
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
  fixture.componentRef.setInput("compact", compact);
  fixture.componentRef.setInput("unconfigured", bare);
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
  const buttons = () => [...element.querySelectorAll<HTMLButtonElement>("sp-button button")];
  const dialog = () => document.querySelector<HTMLElement>("[role=dialog]");
  const dialogButton = (label: string) =>
    [...(dialog()?.querySelectorAll<HTMLButtonElement>("sp-button button") ?? [])].find(
      (button) => text(button) === label,
    );
  const view = () => store.all().find((item) => item.id === ASISTENCIA);
  const toasts = () =>
    TestBed.inject(Toasts)
      .items()
      .map((item) => item.text);
  return { fixture, element, settle, buttons, dialog, dialogButton, view, toasts };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

function type(field: HTMLTextAreaElement | null | undefined, value: string): void {
  if (field === null || field === undefined) throw new Error("no field");
  field.value = value;
  field.dispatchEvent(new Event("input"));
}

describe("Acceptance actions", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("offers asking for adjustments and accepting, compact in the bar", async () => {
    const { element, buttons } = await render();
    expect(buttons().map(text)).toEqual(["Pedir ajustes…", "Aceptar resultado"]);
    const group = element.querySelector("sp-acceptance-actions");
    expect(group?.getAttribute("role")).toBe("group");
    expect(group?.getAttribute("aria-label")).toBe("Decisión sobre el resultado");
    expect(group?.hasAttribute("data-compact")).toBe(false);
    const compact = await render(FixtureData, true);
    expect(
      compact.element.querySelector("sp-acceptance-actions")?.hasAttribute("data-compact"),
    ).toBe(true);
  });

  it("accepts after saying what was done and what comes next (AC4)", async () => {
    const { buttons, dialog, dialogButton, settle, view, toasts } = await render();
    buttons()[1]?.click();
    await settle();
    expect(text(dialog()?.querySelector("h2"))).toBe("Aceptar «Panel de asistencia por curso»");
    expect([...(dialog()?.querySelectorAll("[data-done] li") ?? [])].map(text)).toEqual([
      "T1 Agregados semanales 3c9d1e2",
      "T2 Panel con estudiantes destacados 8b0a4f6",
    ]);
    expect(text(dialog()?.querySelector("[data-after]"))).toBe(
      "Después, el agente redacta el cierre (resumen, desviaciones, decisiones y pendientes) y tú lo confirmas.",
    );
    dialogButton("Aceptar")?.click();
    await settle();
    expect(dialog()).toBeNull();
    expect(view()?.phase).toBe("closing");
    expect(toasts()).toContain("Aceptaste el resultado: el agente redactará el cierre.");
  });

  it("says a quick change closes on accepting", async () => {
    const { dialog, dialogButton, settle, view, toasts } = await render();
    const change = view();
    if (change === undefined) throw new Error("no change");
    TestBed.inject(ResultDialogs).accept({ ...change, kind: "quick" });
    await settle();
    expect(text(dialog()?.querySelector("[data-after]"))).toBe(
      "Es un cambio rápido: se cierra al aceptarlo, con el resumen de sus tareas.",
    );
    dialogButton("Aceptar")?.click();
    await settle();
    expect(toasts()).toContain("Aceptaste el resultado: el cambio está cerrado.");
  });

  it("explains how the request is classified, and sends it word for word (AC5)", async () => {
    const { buttons, dialog, dialogButton, settle, view, toasts } = await render();
    buttons()[0]?.click();
    await settle();
    expect(text(dialog()?.querySelector("h2"))).toBe("Pedir ajustes");
    expect([...(dialog()?.querySelectorAll("[data-classes] dt") ?? [])].map(text)).toEqual([
      "Defecto",
      "Refinamiento",
      "Alcance nuevo",
    ]);
    const send = () => dialogButton("Enviar al agente");
    expect(send()?.getAttribute("aria-disabled")).toBe("true");
    send()?.click();
    await settle();
    expect(view()?.phase).toBe("acceptance");
    type(dialog()?.querySelector("textarea"), "El porcentaje debería mostrar un decimal.");
    await settle();
    expect(send()?.getAttribute("aria-disabled")).not.toBe("true");
    send()?.click();
    await settle();
    expect(dialog()).toBeNull();
    expect(view()?.phase).toBe("adjusting");
    expect(toasts()).toContain("Pediste ajustes: el agente los clasificará en specty next.");
  });

  it("starts the request with the criterion it comes from (AC3)", async () => {
    const { dialog, settle, view } = await render();
    const change = view();
    if (change === undefined) throw new Error("no change");
    TestBed.inject(ResultDialogs).adjust(change, "AC2: ");
    await settle();
    const field = dialog()?.querySelector("textarea");
    expect(field?.value).toBe("AC2: ");
    // The dialog's first focus goes to the request, with the caret after the criterion.
    expect(field?.hasAttribute("cdkFocusInitial")).toBe(true);
    expect([field?.selectionStart, field?.selectionEnd]).toEqual([5, 5]);
  });

  it("keeps the dialog and explains it when the source cannot decide (AC6)", async () => {
    const { buttons, dialog, dialogButton, settle, view, toasts } = await render(Refusing);
    buttons()[1]?.click();
    await settle();
    dialogButton("Aceptar")?.click();
    await settle();
    expect(toasts()).toContain("El servidor no responde.");
    expect(dialog()).not.toBeNull();
    expect(view()?.phase).toBe("acceptance");
  });
});

describe("Deciding with the full verification", () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  /** The sample source, to run the full verification and choose how it ends. */
  function sample(): FixtureData {
    const source = TestBed.inject(SpectyData);
    if (!(source instanceof FixtureData)) throw new Error("no sample source");
    return source;
  }

  it("says under «Aceptar resultado» how it stands, in its color", async () => {
    // Only the run's steps are faked: the store settles on real timeouts.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { element, settle } = await render();
    const hint = () => element.querySelector<HTMLElement>("[data-full-hint]");
    expect(text(hint())).toBe("La verificación completa aún no se ha ejecutado.");
    expect(hint()?.style.color).toBe("var(--color-text-muted)");
    await sample().verifyChange(ASISTENCIA);
    await settle();
    expect(text(hint())).toBe("La verificación completa está corriendo.");
    vi.advanceTimersByTime(STEP_MS * 20);
    await settle();
    expect(text(hint())).toBe("La verificación completa es correcta.");
    expect(hint()?.style.color).toBe("var(--color-phase-done)");
    sample().toggleFullResult();
    await sample().verifyChange(ASISTENCIA);
    vi.advanceTimersByTime(STEP_MS * 20);
    await settle();
    expect(text(hint())).toBe("La verificación completa falló.");
    expect(hint()?.style.color).toBe("var(--color-phase-cancelled)");
    // Only beside the title: the sticky bar keeps its buttons alone.
    const compact = await render(FixtureData, true);
    expect(compact.element.querySelector("[data-full-hint]")).toBeNull();
  });

  it("offers to run it first, follows it while open, and to accept anyway once it failed", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { element, buttons, dialog, dialogButton, settle, view } = await render();
    const note = () => text(dialog()?.querySelector("[data-full-note]"));
    buttons()[1]?.click();
    await settle();
    expect(note()).toBe(
      "No ejecutaste la verificación completa. Puedes aceptar igual, o ejecutarla antes.",
    );
    dialog()?.querySelector<HTMLButtonElement>("[data-run-first]")?.click();
    await settle();
    expect(dialog()).toBeNull();
    expect(text(element.querySelector("[data-full-hint]"))).toBe(
      "La verificación completa está corriendo.",
    );
    // Opened while it runs, the dialog tells how it ended.
    buttons()[1]?.click();
    await settle();
    expect(note()).toBe("La verificación completa está corriendo.");
    vi.advanceTimersByTime(STEP_MS * 20);
    await settle();
    expect(note()).toBe("La verificación completa es correcta.");
    expect(dialogButton("Aceptar")).toBeDefined();
    dialogButton("Cancelar")?.click();
    await settle();

    sample().toggleFullResult();
    await sample().verifyChange(ASISTENCIA);
    vi.advanceTimersByTime(STEP_MS * 20);
    await settle();
    buttons()[1]?.click();
    await settle();
    expect(note()).toBe("La verificación completa falló: revisa su salida antes de aceptar.");
    dialogButton("Aceptar de todos modos")?.click();
    await settle();
    expect(view()?.phase).toBe("closing");
  });

  it("says nothing of it when the project has none", async () => {
    const { element, buttons, dialog, dialogButton, settle } = await render(
      FixtureData,
      false,
      true,
    );
    expect(element.querySelector("[data-full-hint]")).toBeNull();
    buttons()[1]?.click();
    await settle();
    expect(dialog()?.querySelector("[data-full-note]")).toBeNull();
    expect(dialogButton("Aceptar")).toBeDefined();
  });
});
