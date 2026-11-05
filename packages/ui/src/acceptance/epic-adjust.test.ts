// SPDX-License-Identifier: Apache-2.0
// «Pedir ajustes» of an epic: while its slices are implemented, and with its result in acceptance.
import { Component, computed, Injectable, inject, input } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Toasts } from "../components/toast";
import type { ResultDecision } from "../data/acceptance";
import { ChangesStore, DERIVER } from "../data/changes-store";
import { sampleRecords } from "../data/fixtures";
import { type Bilingual, type ChangeRecord, SpectyData } from "../data/records";
import { decideResultIn } from "../data/sample-acceptance";
import { deriveViews } from "../data/views";
import { AcceptanceActions } from "./acceptance-actions";
import { ResultDialogs } from "./result-dialogs";

/** The sample's change in implementation and the one in acceptance, both as epics. */
const IMPLEMENTING = "20261019-boletines-pdf";
const ACCEPTANCE = "20261018-asistencia-curso";
const REQUEST = "C2 sale demasiado grande: divídelo en el PDF y la firma.";

const EPIC_SPEC = `---
kind: epic
---

# Boletines del curso

## Objetivo

Las familias reciben el boletín de cada trimestre sin pedirlo.

## Criterios de aceptación

- AC1: CUANDO el docente cierra el trimestre ENTONCES se genera el boletín en PDF.
- AC2: CUANDO el boletín está listo ENTONCES le llega a cada familia.

## Cortes

- C1: Boletín en PDF
  - ac: AC1
- C2: Envío a las familias
  - ac: AC2
  - depends: C1
`;

/** `record` as an epic: no tasks and nothing pending, with the spec above. */
function asEpic(record: ChangeRecord): ChangeRecord {
  return {
    ...record,
    spec: EPIC_SPEC,
    state: {
      ...record.state,
      kind: "epic",
      tasks: {},
      pending: { scopeRequests: [], adjustment: null },
    },
  };
}

/**
 * The sample project with those two changes as epics, deciding on the result as the sample source
 * does (`decideResultIn`), and keeping each decision it was sent.
 */
@Injectable()
class Epics extends SpectyData {
  private records: readonly ChangeRecord[] = sampleRecords(Date.now()).map((record) =>
    record.state.id === IMPLEMENTING || record.state.id === ACCEPTANCE ? asEpic(record) : record,
  );
  private decisions: readonly ResultDecision[] = [];
  private readonly listeners = new Set<() => void>();

  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve(this.records);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  override readOnly(): Promise<Bilingual | undefined> {
    return Promise.resolve(undefined);
  }

  override decideResult(change: string, decision: ResultDecision): Promise<void> {
    this.decisions = [...this.decisions, decision];
    try {
      this.records = this.records.map((record) =>
        record.state.id === change ? decideResultIn(record, decision, Date.now()) : record,
      );
    } catch (error) {
      return Promise.reject(error);
    }
    for (const listener of this.listeners) listener();
    return Promise.resolve();
  }

  sent(): readonly ResultDecision[] {
    return this.decisions;
  }

  /** The request the change keeps for the agent, if any. */
  adjustment(id: string): string | undefined {
    return this.records.find((record) => record.state.id === id)?.state.pending.adjustment?.request;
  }
}

/** The actions of the epic in acceptance, as its page shows them. */
@Component({
  imports: [AcceptanceActions],
  template: `@if (change(); as change) { <sp-acceptance-actions [change]="change" /> }`,
})
class Host {
  readonly id = input(ACCEPTANCE);
  private readonly store = inject(ChangesStore);
  readonly change = computed(() => this.store.listed().find((item) => item.id === this.id()));
}

async function render(lang: "es" | "en" = "es") {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SpectyData, useClass: Epics },
      {
        provide: DERIVER,
        useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
      },
    ],
  });
  const fixture = TestBed.createComponent(Host);
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
  /** Each way the dialog explains: its name and what the agent does. */
  const ways = () =>
    [...(dialog()?.querySelectorAll("[data-classes] dt") ?? [])].map((term) => [
      text(term),
      text(term.nextElementSibling),
    ]);
  const view = (id: string) => store.listed().find((item) => item.id === id);
  /** Opens «Pedir ajustes» of the epic in implementation, as its button does. */
  const adjustEpic = async () => {
    const epic = view(IMPLEMENTING);
    if (epic === undefined) throw new Error("no epic");
    TestBed.inject(ResultDialogs).adjust(epic);
    await settle();
  };
  const source = TestBed.inject(SpectyData);
  if (!(source instanceof Epics)) throw new Error("no epics source");
  const toasts = () =>
    TestBed.inject(Toasts)
      .items()
      .map((item) => item.text);
  return { settle, buttons, dialog, dialogButton, ways, view, adjustEpic, source, toasts };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

function type(field: HTMLTextAreaElement | null | undefined, value: string): void {
  if (field === null || field === undefined) throw new Error("no field");
  field.value = value;
  field.dispatchEvent(new Event("input"));
}

describe("Asking for adjustments of an epic", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC2: explains how the agent adjusts an epic in implementation, and that new slices wait", async () => {
    const { dialog, ways, view, adjustEpic } = await render();
    expect([view(IMPLEMENTING)?.kind, view(IMPLEMENTING)?.phase]).toEqual(["epic", "implementing"]);
    await adjustEpic();
    expect(text(dialog()?.querySelector("h2"))).toBe("Pedir ajustes");
    expect(text(dialog()?.querySelector("header p"))).toBe(
      "Escribe qué hay que cambiar, con tus palabras. El agente recibe la petición tal cual y ajusta la épica:",
    );
    expect(ways()).toEqual([
      [
        "Dividir un corte",
        "Un corte que sale demasiado grande: lo estrecha y añade el resto como cortes nuevos.",
      ],
      ["Corte nuevo", "Algo falta o no se cumple: añade un corte que lo cubra."],
      [
        "Alcance nuevo",
        "Ningún criterio lo cubre o choca con «Fuera de alcance»: no toca la spec y te propone un cambio aparte.",
      ],
    ]);
    expect(text(dialog()?.querySelector("[data-note]"))).toBe(
      "Los cortes cerrados no se tocan. La épica vuelve a revisión: ningún corte nuevo empieza hasta que apruebes el ajuste, y los que están en curso siguen.",
    );
    expect(dialog()?.querySelector("textarea")?.placeholder).toBe(
      "Por ejemplo: C2 sale demasiado grande, divídelo",
    );
  });

  it("AC2: says it in English too", async () => {
    const { dialog, ways, adjustEpic } = await render("en");
    await adjustEpic();
    expect(text(dialog()?.querySelector("h2"))).toBe("Ask for adjustments");
    expect(text(dialog()?.querySelector("header p"))).toBe(
      "Write what needs to change, in your own words. The agent gets the request as it is and adjusts the epic:",
    );
    expect(ways()).toEqual([
      [
        "Split a slice",
        "A slice that comes out too large: it narrows it and adds the rest as new slices.",
      ],
      ["New slice", "Something is missing or not met: it adds a slice that covers it."],
      [
        "New scope",
        'No criterion covers it, or it contradicts "Out of scope": it leaves the spec alone and suggests a separate change.',
      ],
    ]);
    expect(text(dialog()?.querySelector("[data-note]"))).toBe(
      "Closed slices stay as they are. The epic goes back to review: no new slice starts until you approve the adjustment, and those in progress go on.",
    );
    expect(dialog()?.querySelector("textarea")?.placeholder).toBe(
      "For example: C2 comes out too large, split it",
    );
  });

  it("AC3: sends the request word for word; the epic is adjusting and a notice says what comes next", async () => {
    const { dialog, dialogButton, settle, view, adjustEpic, source, toasts } = await render();
    await adjustEpic();
    const send = () => dialogButton("Enviar al agente");
    expect(send()?.getAttribute("aria-disabled")).toBe("true");
    send()?.click();
    await settle();
    expect(source.sent()).toEqual([]);
    expect(view(IMPLEMENTING)?.phase).toBe("implementing");
    type(dialog()?.querySelector("textarea"), REQUEST);
    await settle();
    expect(send()?.getAttribute("aria-disabled")).not.toBe("true");
    send()?.click();
    await settle();
    expect(dialog()).toBeNull();
    expect(source.sent()).toEqual([{ kind: "adjust", request: REQUEST }]);
    expect(source.adjustment(IMPLEMENTING)).toBe(REQUEST);
    expect(view(IMPLEMENTING)?.phase).toBe("adjusting");
    expect(toasts()).toContain(
      "Pediste ajustes de la épica: el agente la ajustará en specty next y volverá a tu revisión.",
    );
  });

  it("AC5: gives an epic in acceptance the same ways, and its new slices after the approval", async () => {
    const { buttons, dialog, dialogButton, settle, ways, view, toasts } = await render();
    expect([view(ACCEPTANCE)?.kind, view(ACCEPTANCE)?.phase]).toEqual(["epic", "acceptance"]);
    expect(buttons().map(text)).toEqual(["Pedir ajustes…", "Aceptar resultado"]);
    buttons()[0]?.click();
    await settle();
    expect(ways().map(([way]) => way)).toEqual([
      "Dividir un corte",
      "Corte nuevo",
      "Alcance nuevo",
    ]);
    expect(text(dialog()?.querySelector("[data-note]"))).toBe(
      "Los cortes cerrados no se tocan. La épica vuelve a revisión, y sus cortes nuevos empiezan cuando apruebes el ajuste.",
    );
    type(dialog()?.querySelector("textarea"), REQUEST);
    await settle();
    dialogButton("Enviar al agente")?.click();
    await settle();
    expect(view(ACCEPTANCE)?.phase).toBe("adjusting");
    expect(toasts()).toContain(
      "Pediste ajustes de la épica: el agente la ajustará en specty next y volverá a tu revisión.",
    );
  });
});
