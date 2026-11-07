// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { DEFAULT_CONFIG, defaultGlossary, resolveConfig } from "@baquia-dev/specty-core";
import { type ConfigEdit, presetText, settingChanges } from "@baquia-dev/specty-core/light";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type Bilingual, type ChangeRecord, SpectyData } from "../data/records";
import type { ConfigCheck, ConfigRecord, ConfigSaved } from "../data/source";
import { deriveViews } from "../data/views";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
};

/** A project in Spanish with every key of the profiles at its default. */
const BASE = { version: 1, language: "es" };

/** The values of Ligero and of Estricto in the file, as Specty writes them. */
const LIGHT = {
  policy: { tests: "off" },
  lines: { warn: 500, fail: 1000, tests: { warn: 600, fail: 1200 } },
  checks: { functions: { maxLines: 100, complexity: 20 } },
};
const STRICT = { policy: { tests: "contract" }, checks: { coverage: { warn: 90, error: 80 } } };

const DEFAULTS = { ...DEFAULT_CONFIG, glossary: defaultGlossary("es") };

/** What the server gives for a valid `input`: what Specty uses, and the defaults in Spanish. */
function valid(input: unknown): ConfigRecord {
  const result = resolveConfig(input);
  if (!result.ok) throw new Error("the sample is not valid");
  return { input, config: result.config, defaults: DEFAULTS, issues: [] };
}

function isMap(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `input` with `edit` applied: its value at its keys, or its key removed, with no empty map left. */
function edited(input: unknown, edit: ConfigEdit): unknown {
  const [key, ...rest] = edit.path;
  const map = isMap(input) ? input : {};
  if (key === undefined) return input;
  const { [key]: old, ...others } = map;
  const value = rest.length === 0 ? edit.value : edited(old, { ...edit, path: rest });
  const gone = value === undefined || (isMap(value) && Object.keys(value).length === 0);
  return gone && (rest.length > 0 || edit.value === undefined)
    ? others
    : { ...others, [key]: value };
}

/** The value at a key with dots, inside maps; none when a key on the way is missing. */
function valueAt(source: unknown, key: string): unknown {
  let value = source;
  for (const part of key.split(".")) {
    if (!isMap(value)) return undefined;
    value = Object.entries(value).find(([name]) => name === part)?.[1];
  }
  return value;
}

const fallback = (key: string): unknown => valueAt(DEFAULTS, key);

let served: ConfigRecord = valid(BASE);
let reason: Bilingual | undefined;

/** The prototype as the person's server: the configuration the test serves, checked and saved by the core. */
@Injectable()
class Configured extends FixtureData {
  override config(): Promise<ConfigRecord> {
    return Promise.resolve(served);
  }

  override readOnly(): Promise<Bilingual | undefined> {
    return Promise.resolve(reason);
  }

  override checkConfig(edits: readonly ConfigEdit[]): Promise<ConfigCheck> {
    const input = edits.reduce(edited, served.input);
    const result = resolveConfig(input);
    return Promise.resolve({
      issues: result.ok ? [] : result.issues,
      changes: settingChanges(served.input, input),
    });
  }

  override saveConfig(edits: readonly ConfigEdit[]): Promise<ConfigSaved> {
    const input = edits.reduce(edited, served.input);
    const changes = settingChanges(served.input, input);
    served = valid(input);
    return Promise.resolve({ commit: "abc1234", changes });
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

/** Opens the page in the view Flujo, in Básico, with `input` served. */
async function open(
  options: {
    readonly input?: unknown;
    readonly lang?: "es" | "en";
    readonly readOnly?: Bilingual;
  } = {},
) {
  served = valid(options.input ?? BASE);
  reason = options.readOnly;
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
  const pick = async (which: "view" | "mode", value: string) => {
    page()
      ?.querySelector<HTMLInputElement>(`[data-${which}] input[type="radio"][value="${value}"]`)
      ?.click();
    await settle();
  };
  await pick("view", "flow");
  await pick("mode", "basic");
  const flow = () => page()?.querySelector<HTMLElement>("sp-settings-flow");
  const presets = () => flow()?.querySelector<HTMLElement>("[data-presets]");
  const card = (id: string) => presets()?.querySelector<HTMLElement>(`[data-preset="${id}"]`);
  const cards = () => [...(presets()?.querySelectorAll<HTMLElement>("[data-preset]") ?? [])];
  const press = async (button: Element | null | undefined) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error("no button");
    button.click();
    await settle();
  };
  const dialog = () => document.querySelector<HTMLElement>("sp-save-dialog");
  return {
    page,
    flow,
    presets,
    card,
    settle,
    pick,
    press,
    dialog,
    ids: () => cards().map((item) => item.dataset.preset),
    names: () => cards().map((item) => seen(item.querySelector("[data-preset-name]"))),
    descriptions: () =>
      cards().map((item) => seen(item.querySelector("[data-preset-description]"))),
    marks: (id: string) =>
      [...(card(id)?.querySelectorAll<HTMLElement>("[data-mark]") ?? [])].map(
        (mark) => mark.dataset.mark,
      ),
    mark: (id: string, kind: string) => seen(card(id)?.querySelector(`[data-mark="${kind}"]`)),
    chosen: () =>
      cards()
        .filter((item) => item.querySelector('[data-mark="chosen"]') !== null)
        .map((item) => item.dataset.preset),
    choose: async (id: string) => press(card(id)?.querySelector("button")),
    phases: () =>
      [...(flow()?.querySelectorAll<HTMLElement>("[data-line] [data-phase-column]") ?? [])].map(
        (item) => item.dataset.phaseColumn,
      ),
    sentences: () => [...(flow()?.querySelectorAll("[data-sentences] li") ?? [])].map(seen),
    count: () => text(page()?.querySelector('[data-actions="header"] [data-count]')),
    review: () =>
      page()?.querySelector<HTMLButtonElement>('[data-actions="header"] [data-review] button'),
  };
}

describe("the profiles in the view Flujo, in Básico", () => {
  it("AC1: shows Ligero, Equilibrado, Estricto and Propio above the line, with what each fixes, «Por defecto» on Equilibrado and «Elegido» on the one that matches", async () => {
    const ui = await open();
    expect(ui.ids()).toEqual(["light", "balanced", "strict", "custom"]);
    expect(ui.names()).toEqual(["Ligero", "Equilibrado", "Estricto", "Propio"]);
    expect(ui.descriptions()).toEqual(
      (["light", "balanced", "strict", "custom"] as const).map(
        (preset) => presetText(preset, fallback, "es").description,
      ),
    );
    expect(ui.marks("balanced")).toEqual(["default", "chosen"]);
    expect(ui.mark("balanced", "default")).toBe("Por defecto");
    expect(ui.mark("balanced", "chosen")).toBe("Elegido");
    expect(ui.chosen()).toEqual(["balanced"]);
    const line = ui.flow()?.querySelector("[data-line]");
    const presets = ui.presets();
    expect(line).not.toBeNull();
    expect(presets).not.toBeNull();
    if (line === null || line === undefined || presets === null || presets === undefined) return;
    expect(presets.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AC1: marks Propio when no profile matches the configuration", async () => {
    const ui = await open({ input: { ...BASE, policy: { tests: "contract" } } });
    expect(ui.chosen()).toEqual(["custom"]);
    expect(ui.mark("custom", "chosen")).toBe("Elegido");
    expect(ui.card("custom")?.querySelector("button")).toBeNull();
  });

  it("AC2: marks the profile whose keys have its values, though other keys differ from the defaults", async () => {
    const others = { subagents: false, verify: { timeoutSec: 2000 }, split: { maxModules: 3 } };
    const light = await open({ input: { ...BASE, ...others, ...LIGHT } });
    expect(light.chosen()).toEqual(["light"]);
    const strict = await open({ input: { ...BASE, ...others, ...STRICT } });
    expect(strict.chosen()).toEqual(["strict"]);
  });

  it("AC3, AC4: choosing a profile marks it, and the line and its sentences show its flow before saving", async () => {
    const ui = await open();
    expect(ui.phases()).not.toContain("testing");
    await ui.choose("strict");
    expect(ui.chosen()).toEqual(["strict"]);
    expect(ui.card("strict")?.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
    expect(ui.card("balanced")?.querySelector("button")?.getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(ui.phases()).toContain("testing");
    expect(ui.sentences()[0]).toBe("Las features piden sus tests aprobados antes del código.");
    expect(ui.sentences().at(-1)).toBe(
      "La cobertura del diff falla si los tests ejecutan menos del 80 % de las líneas que añade el cambio, y avisa por debajo del 90 %.",
    );
    expect(ui.count()).toBe("2");
    await ui.choose("light");
    expect(ui.chosen()).toEqual(["light"]);
    expect(ui.phases()).not.toContain("testing");
    expect(ui.sentences()[0]).toBe("Specty no pide tests.");
    expect(ui.sentences().slice(-3)).toEqual([
      "Una tarea no puede dejar un archivo con más de 1000 líneas de código, y Specty avisa por encima de 500.",
      "specty check señala cada función de más de 100 líneas o con complejidad mayor que 20.",
      "La cobertura del diff avisa si los tests ejecutan menos del 80 % de las líneas que añade el cambio.",
    ]);
    expect(ui.count()).toBe("5");
  });

  it("AC5: «Revisar y guardar» lists only the settings that change, and saving changes only those keys", async () => {
    const input = { ...BASE, policy: { tests: "recommended" }, lines: { warn: 300 } };
    const ui = await open({ input });
    await ui.choose("strict");
    await ui.press(ui.review());
    expect(
      [...(ui.dialog()?.querySelectorAll<HTMLElement>("[data-change]") ?? [])].map(
        (found) => found.dataset.change,
      ),
    ).toEqual(["policy.tests", "checks.coverage"]);
    ui.dialog()?.querySelector<HTMLInputElement>('[data-confirm] input[type="checkbox"]')?.click();
    await ui.settle();
    await ui.press(ui.dialog()?.querySelector("[data-save] button"));
    expect(served.input).toEqual({
      ...BASE,
      policy: { tests: "contract" },
      lines: { warn: 300 },
      checks: { coverage: { warn: 90, error: 80 } },
    });
  });

  it("AC6: choosing another profile replaces the earlier one's edits, and the file's leaves nothing to save", async () => {
    const ui = await open({ input: { ...BASE, lines: { warn: 300 } } });
    await ui.choose("light");
    expect(ui.count()).toBe("5");
    await ui.choose("strict");
    expect(ui.count()).toBe("2");
    expect(ui.chosen()).toEqual(["strict"]);
    await ui.choose("balanced");
    expect(ui.count()).toBe("0");
    expect(ui.chosen()).toEqual(["balanced"]);
  });

  it("AC8: read only, the profiles show their marks but cannot be chosen; in Advanced they do not show", async () => {
    const ui = await open({
      readOnly: { es: "hay un cambio en curso", en: "a change is in progress" },
    });
    expect(ui.ids()).toEqual(["light", "balanced", "strict", "custom"]);
    expect(ui.presets()?.querySelectorAll("button").length).toBe(0);
    expect(ui.chosen()).toEqual(["balanced"]);
    await ui.pick("mode", "advanced");
    expect(ui.presets()).toBeNull();
  });

  it("AC9: says the profiles, their marks, what each fixes and the limits in English", async () => {
    const ui = await open({ lang: "en" });
    expect(ui.names()).toEqual(["Light", "Balanced", "Strict", "Custom"]);
    expect(ui.descriptions()[3]).toBe(
      "What you build in Advanced: changing a setting of a profile makes it custom.",
    );
    expect(ui.mark("balanced", "default")).toBe("Default");
    expect(ui.mark("balanced", "chosen")).toBe("Chosen");
    expect(ui.sentences().slice(-3)).toEqual([
      "A task cannot leave a file with more than 500 lines of code, and Specty warns above 300.",
      "specty check points out each function of more than 50 lines or with a complexity above 10.",
      "Diff coverage warns when the tests run less than 80% of the lines the change adds.",
    ]);
  });
});
