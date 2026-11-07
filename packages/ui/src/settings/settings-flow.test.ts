// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { DEFAULT_CONFIG, defaultGlossary, resolveConfig } from "@baquia-dev/specty-core";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type ChangeRecord, SpectyData } from "../data/records";
import type { ConfigRecord } from "../data/source";
import { deriveViews } from "../data/views";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
};

/** A project like this repository: its commands, tests as contract and a build after landing. */
const PROJECT = {
  version: 1,
  language: "es",
  verify: { default: "pnpm test", full: "pnpm check" },
  policy: { tests: "contract" },
  git: { afterLanding: "pnpm build" },
};

function valid(input: unknown): ConfigRecord {
  const result = resolveConfig(input);
  if (!result.ok) throw new Error("the sample is not valid");
  return {
    input,
    config: result.config,
    defaults: { ...DEFAULT_CONFIG, glossary: defaultGlossary("es") },
    issues: [],
  };
}

let served: ConfigRecord = valid(PROJECT);

/** The prototype, with the configuration the test serves; delegated mode is off. */
@Injectable()
class Configured extends FixtureData {
  override config(): Promise<ConfigRecord> {
    return Promise.resolve(served);
  }
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

/** What the eye reads: the text without what only a screen reader hears. */
function seen(element: Element | null | undefined): string {
  const copy = element?.cloneNode(true);
  if (!(copy instanceof Element)) return "";
  for (const hidden of copy.querySelectorAll(".sr-only")) hidden.remove();
  return text(copy);
}

/** Opens the page in the view Flujo, in the mode `mode`. */
async function open(
  options: {
    readonly input?: unknown;
    readonly lang?: "es" | "en";
    readonly mode?: "basic" | "advanced";
  } = {},
) {
  served = valid(options.input ?? PROJECT);
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", options.lang ?? "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(APP_ROUTES, withComponentInputBinding()),
      { provide: SpectyData, useClass: Configured },
      IN_THREAD,
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  const element: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    for (let round = 0; round < 40; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await TestBed.inject(Router).navigateByUrl("/settings");
  await settle();
  const page = () => element.querySelector<HTMLElement>("sp-settings-page");
  const choose = async (which: "view" | "mode", value: string) => {
    page()
      ?.querySelector<HTMLInputElement>(`[data-${which}] input[type="radio"][value="${value}"]`)
      ?.click();
    await settle();
  };
  await choose("view", "flow");
  await choose("mode", options.mode ?? "basic");
  const flow = () => page()?.querySelector<HTMLElement>("sp-settings-flow");
  const line = () => flow()?.querySelector<HTMLElement>("[data-line]");
  const columns = () => [...(line()?.querySelectorAll<HTMLElement>("[data-phase-column]") ?? [])];
  const column = (phase: string) =>
    line()?.querySelector<HTMLElement>(`[data-phase-column="${phase}"]`);
  const slot = (id: string) => line()?.querySelector<HTMLElement>(`[data-slot="${id}"]`);
  return {
    page,
    flow,
    line,
    column,
    slot,
    phases: () => columns().map((item) => item.dataset.phaseColumn),
    names: () => columns().map((item) => text(item.querySelector("[data-phase-name]"))),
    counts: () => columns().map((item) => text(item.querySelector("[data-phase-count]"))),
    slots: (phase: string) =>
      [...(column(phase)?.querySelectorAll<HTMLElement>("[data-slot]") ?? [])].map(
        (item) => item.dataset.slot,
      ),
    locked: () =>
      [...(line()?.querySelectorAll<HTMLElement>("[data-slot]") ?? [])]
        .filter((item) => item.querySelector("[data-lock]") !== null)
        .map((item) => item.dataset.slot),
    sentences: () => [...(flow()?.querySelectorAll("[data-sentences] li") ?? [])].map(seen),
    options: (which: "view" | "mode") =>
      [...(page()?.querySelectorAll(`[data-${which}] label[data-value]`) ?? [])].map(text),
  };
}

describe("the view Flujo of the settings page", () => {
  it("AC1: shows the phases in line, each with its number of pieces and the pieces the configuration equips", async () => {
    const { phases, names, counts, slots } = await open();
    expect(phases()).toEqual([
      "draft",
      "review",
      "testing",
      "implementing",
      "acceptance",
      "closing",
    ]);
    expect(names()).toEqual([
      "Borrador",
      "Revisión",
      "Tests",
      "Implementación",
      "Aceptación",
      "Cierre",
    ]);
    expect(counts()).toEqual(["3", "1", "1", "7", "3", "3"]);
    expect(slots("draft")).toEqual(["glossary", "spec-warnings", "worktrees"]);
    expect(slots("review")).toEqual(["spec-approval"]);
    expect(slots("testing")).toEqual(["tests-approval"]);
    expect(slots("implementing")).toEqual([
      "tests",
      "task-verify",
      "checks",
      "lines",
      "subagents",
      "auto-approve",
      "guard",
    ]);
    expect(slots("acceptance")).toEqual(["full-verify", "coverage", "acceptance"]);
    expect(slots("closing")).toEqual(["closing", "retro", "after-landing"]);
  });

  it("AC1: names each piece in its slot, and shows the pieces the file equips", async () => {
    const { slot, slots } = await open({
      input: {
        ...PROJECT,
        verify: { ...PROJECT.verify, quick: "pnpm lint" },
        review: { command: "claude -p" },
        subagents: false,
      },
    });
    expect(seen(slot("guard"))).toBe("Guard del agente");
    expect(seen(slot("task-verify"))).toBe("Verificación de la tarea");
    expect(slots("review")).toEqual(["spec-approval", "independent-review"]);
    expect(slots("implementing")).toEqual([
      "tests",
      "task-verify",
      "quick-check",
      "checks",
      "lines",
      "auto-approve",
      "guard",
    ]);
  });

  it("AC1: shows the phase Tests only with policy.tests: contract", async () => {
    const { phases, slots } = await open({ input: { ...PROJECT, policy: { tests: "required" } } });
    expect(phases()).toEqual(["draft", "review", "implementing", "acceptance", "closing"]);
    expect(slots("testing")).toEqual([]);
  });

  it("AC2: shows Specty's guarantees with a lock, the mark «Garantía de Specty» and why they are not removed", async () => {
    const { locked, slot } = await open();
    expect(locked()).toEqual(["spec-approval", "tests-approval", "guard", "acceptance"]);
    const lock = slot("guard")?.querySelector("[data-lock]");
    expect(lock?.getAttribute("aria-label")).toBe("Garantía de Specty");
    expect(slot("guard")?.getAttribute("title")).toBe(
      "No se quita: sin él, el agente podría saltarse la spec.",
    );
    expect(slot("acceptance")?.getAttribute("title")).toBe(
      "No se quita: un cambio no termina sin tu aceptación.",
    );
    expect(slot("subagents")?.querySelector("[data-lock]")).toBeNull();
  });

  it("AC3: in Basic, the line has no buttons to choose a phase, equip nor remove, and sentences say what the flow does", async () => {
    const { flow, line, sentences } = await open();
    expect(line()?.querySelectorAll("button").length).toBe(0);
    expect(flow()?.querySelector("[data-equip]")).toBeNull();
    expect(flow()?.querySelector("[data-remove]")).toBeNull();
    expect(flow()?.querySelector("sp-flow-piece")).toBeNull();
    expect(sentences()).toEqual([
      "Las features piden sus tests aprobados antes del código.",
      "Cada tarea pasa pnpm test antes de completarse.",
      "Al aceptar, Specty ejecuta pnpm check.",
      "Sin revisión independiente: la spec y el diff los revisas tú.",
      "Un cambio rápido toca como mucho 3 archivos de código.",
      "Tú apruebas, aceptas y cierras cada cambio.",
      "Una tarea no puede dejar un archivo con más de 500 líneas de código, y Specty avisa por encima de 300.",
      "specty check señala cada función de más de 50 líneas o con complejidad mayor que 10.",
      "La cobertura del diff avisa si los tests ejecutan menos del 80 % de las líneas que añade el cambio.",
    ]);
    expect(
      [...(flow()?.querySelectorAll("[data-sentences] code") ?? [])].map((code) => text(code)),
    ).toEqual(["pnpm test", "pnpm check", "specty check"]);
  });

  it("AC3: in Advanced, each phase of the line is a button and there are no sentences", async () => {
    const { flow, column } = await open({ mode: "advanced" });
    expect(column("implementing")?.querySelector("button[data-phase-head]")).not.toBeNull();
    expect(flow()?.querySelector("[data-sentences]")).toBeNull();
  });

  it("AC9: shows the closing phase, which has no key yet, as coming soon, with no control", async () => {
    const { slot } = await open();
    const closing = slot("closing");
    expect(text(closing?.querySelector('[data-mark="soon"]'))).toBe("Próximamente");
    expect(closing?.querySelectorAll("button, input").length).toBe(0);
    expect(slot("retro")?.querySelector('[data-mark="soon"]')).toBeNull();
  });

  it("AC12: says the phases, the pieces, the guarantees, the sentences and the selectors in English", async () => {
    const { names, slot, sentences, options } = await open({ lang: "en" });
    expect(names()).toEqual(["Draft", "Review", "Tests", "Implementing", "Acceptance", "Closing"]);
    expect(seen(slot("guard"))).toBe("Agent guard");
    expect(slot("guard")?.querySelector("[data-lock]")?.getAttribute("aria-label")).toBe(
      "Specty guarantee",
    );
    expect(slot("guard")?.getAttribute("title")).toBe(
      "It cannot be removed: without it, the agent could skip the spec.",
    );
    expect(text(slot("closing")?.querySelector('[data-mark="soon"]'))).toBe("Coming soon");
    expect(sentences()[0]).toBe("Features need their tests approved before their code.");
    expect(sentences()[5]).toBe("You approve, accept and close each change.");
    expect(options("view")).toEqual(["General", "Flow"]);
    expect(options("mode")).toEqual(["Basic", "Advanced"]);
  });
});
