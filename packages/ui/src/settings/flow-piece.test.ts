// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { DEFAULT_CONFIG, defaultGlossary, resolveConfig } from "@baquia-dev/specty-core";
import { type ConfigEdit, settingChanges } from "@baquia-dev/specty-core/light";
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

let served: ConfigRecord = valid(PROJECT);
let reason: Bilingual | undefined;
let saved: (readonly ConfigEdit[])[] = [];

/**
 * The prototype as the person's server: the configuration the test serves, checked by the core
 * as the server does, and saved into it with a commit. Delegated mode starts off.
 */
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
    saved = [...saved, edits];
    const input = edits.reduce(edited, served.input);
    const changes = settingChanges(served.input, input);
    served = valid(input);
    return Promise.resolve({ commit: "abc1234", changes });
  }
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Opens the page in the view Flujo, in Advanced. */
async function open(
  options: {
    readonly input?: unknown;
    readonly lang?: "es" | "en";
    readonly readOnly?: Bilingual;
  } = {},
) {
  served = valid(options.input ?? PROJECT);
  reason = options.readOnly;
  saved = [];
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
  page()?.querySelector<HTMLInputElement>('[data-view] input[type="radio"][value="flow"]')?.click();
  await settle();
  const flow = () => page()?.querySelector<HTMLElement>("sp-settings-flow");
  const press = async (button: Element | null | undefined) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error("no button");
    button.click();
    await settle();
  };
  const ids = (where: "equipped" | "library") =>
    [...(flow()?.querySelectorAll<HTMLElement>(`[data-${where}] sp-flow-piece`) ?? [])].map(
      (piece) => piece.dataset.piece,
    );
  const piece = (id: string) =>
    flow()?.querySelector<HTMLElement>(`sp-flow-piece[data-piece="${id}"]`);
  const dialog = () => document.querySelector<HTMLElement>("[role=dialog]");
  return {
    page,
    flow,
    settle,
    press,
    piece,
    dialog,
    equipped: () => ids("equipped"),
    library: () => ids("library"),
    heading: (where: "equipped" | "library") => text(flow()?.querySelector(`[data-${where}] h3`)),
    phase: (id: string) =>
      flow()?.querySelector<HTMLButtonElement>(
        `[data-phase-column="${id}"] button[data-phase-head]`,
      ),
    slots: (phase: string) =>
      [
        ...(flow()?.querySelectorAll<HTMLElement>(
          `[data-line] [data-phase-column="${phase}"] [data-slot]`,
        ) ?? []),
      ].map((item) => item.dataset.slot),
    remove: (id: string) => piece(id)?.querySelector<HTMLButtonElement>("[data-remove] button"),
    equip: (id: string) => piece(id)?.querySelector<HTMLButtonElement>("[data-equip] button"),
    rows: (id: string) =>
      [...(piece(id)?.querySelectorAll<HTMLElement>("[data-setting]") ?? [])].map(
        (row) => row.dataset.setting,
      ),
    count: () => text(page()?.querySelector('[data-actions="header"] [data-review] [data-count]')),
    review: () =>
      page()?.querySelector<HTMLButtonElement>('[data-actions="header"] [data-review] button'),
    save: () => document.querySelector<HTMLButtonElement>("sp-save-dialog [data-save] button"),
    type: async (path: string, value: string) => {
      const input = flow()?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[data-field="${path}"] input[type="text"], [data-field="${path}"] textarea`,
      );
      if (input === null || input === undefined) throw new Error(`no control for ${path}`);
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await settle();
    },
    button: (label: string) =>
      [...(dialog()?.querySelectorAll<HTMLButtonElement>("sp-button button") ?? [])].find(
        (button) => text(button) === label,
      ),
  };
}

describe("the pieces of a phase in Advanced", () => {
  it("AC5: shows the chosen phase's equipped pieces with their settings and controls, and the pieces to equip", async () => {
    const o = await open();
    expect(o.phase("implementing")?.getAttribute("aria-pressed")).toBe("true");
    expect(o.heading("equipped")).toBe("Equipado en Implementación");
    expect(o.heading("library")).toBe("Para equipar");
    expect(o.equipped()).toEqual([
      "tests",
      "task-verify",
      "checks",
      "lines",
      "subagents",
      "auto-approve",
      "guard",
    ]);
    expect(o.library()).toEqual(["quick-check", "pre-commit"]);
    expect(o.rows("lines")).toEqual(["lines.warn", "lines.fail", "lines.tests", "lines.exclude"]);
    expect(o.piece("lines")?.querySelectorAll("[data-field]").length).toBeGreaterThan(0);
    expect(text(o.piece("subagents")?.querySelector("[data-piece-name]"))).toBe("Subagentes");
    expect(text(o.piece("subagents")?.querySelector("[data-piece-description]"))).not.toBe("");

    await o.press(o.phase("review"));
    expect(o.phase("review")?.getAttribute("aria-pressed")).toBe("true");
    expect(o.phase("implementing")?.getAttribute("aria-pressed")).toBe("false");
    expect(o.heading("equipped")).toBe("Equipado en Revisión");
    expect(o.equipped()).toEqual(["spec-approval"]);
    expect(o.library()).toEqual(["independent-review", "delegated"]);
  });

  it("AC2: shows a guarantee with its lock, its mark and why it is not removed, with no action nor control", async () => {
    const o = await open();
    const guard = o.piece("guard");
    expect(guard?.querySelector("[data-lock]")).not.toBeNull();
    expect(text(guard?.querySelector('[data-mark="guarantee"]'))).toBe("Garantía de Specty");
    expect(text(guard?.querySelector("[data-why]"))).toBe(
      "No se quita: sin él, el agente podría saltarse la spec.",
    );
    expect(guard?.querySelectorAll("button, input, textarea").length).toBe(0);
    expect(o.remove("tests")).toBeNull();
    expect(o.remove("checks")).toBeNull();
  });

  it("AC6: removes and equips a yes-or-no piece at once, counts the change and saves its key with the dialog", async () => {
    const o = await open();
    await o.press(o.remove("subagents"));
    expect(o.equipped()).not.toContain("subagents");
    expect(o.library()).toEqual(["quick-check", "subagents", "pre-commit"]);
    expect(o.slots("implementing")).not.toContain("subagents");
    expect(o.count()).toBe("1");

    await o.press(o.equip("pre-commit"));
    expect(o.equipped()).toContain("pre-commit");
    expect(o.slots("implementing")).toContain("pre-commit");
    expect(o.count()).toBe("2");

    await o.press(o.review());
    expect(document.querySelector('sp-save-dialog [data-change="subagents"]')).not.toBeNull();
    expect(
      document.querySelector('sp-save-dialog [data-change="checks.preCommit"]'),
    ).not.toBeNull();
    await o.press(o.save());
    expect(saved).toEqual([
      [
        { path: ["subagents"], value: false },
        { path: ["checks", "preCommit"], value: true },
      ],
    ]);
  });

  it("AC6: equipping a piece back to its default takes its key out of the file", async () => {
    const o = await open({ input: { ...PROJECT, subagents: false } });
    expect(o.library()).toContain("subagents");
    await o.press(o.equip("subagents"));
    expect(o.equipped()).toContain("subagents");
    expect(o.count()).toBe("1");
    await o.press(o.review());
    await o.press(o.save());
    expect(saved).toEqual([[{ path: ["subagents"] }]]);

    const again = await open();
    await again.press(again.remove("subagents"));
    await again.press(again.equip("subagents"));
    expect(again.equipped()).toContain("subagents");
    expect(again.count()).toBe("0");
  });

  it("AC7: removing a command piece takes its keys out of the file", async () => {
    const o = await open({
      input: { ...PROJECT, review: { command: "claude -p", timeoutSec: 900 } },
    });
    await o.press(o.phase("review"));
    expect(o.equipped()).toEqual(["spec-approval", "independent-review"]);
    expect(o.rows("independent-review")).toEqual(["review.command", "review.timeoutSec"]);
    await o.press(o.remove("independent-review"));
    expect(o.library()).toContain("independent-review");
    expect(o.slots("review")).toEqual(["spec-approval"]);
    await o.press(o.review());
    await o.press(o.save());
    expect(saved).toEqual([[{ path: ["review", "command"] }, { path: ["review", "timeoutSec"] }]]);
  });

  it("AC7: equipping a command piece shows its settings to write the command, and writing it equips it", async () => {
    const o = await open();
    await o.press(o.equip("quick-check"));
    expect(o.equipped()).toContain("quick-check");
    expect(o.library()).not.toContain("quick-check");
    expect(o.rows("quick-check")).toEqual(["verify.quick"]);
    expect(o.slots("implementing")).not.toContain("quick-check");
    expect(o.count()).toBe("0");

    await o.type("verify.quick", "pnpm lint");
    expect(o.slots("implementing")).toContain("quick-check");
    expect(o.count()).toBe("1");
    await o.press(o.review());
    await o.press(o.save());
    expect(saved).toEqual([[{ path: ["verify", "quick"], value: "pnpm lint" }]]);
  });

  it("AC1: in Advanced, the closing phase shows its setting flow.closing and «Quitar», with no mark «Próximamente»", async () => {
    const o = await open();
    await o.press(o.phase("closing"));
    expect(o.heading("equipped")).toBe("Equipado en Cierre");
    expect(o.equipped()).toEqual(["closing", "retro", "after-landing"]);
    expect(o.rows("closing")).toEqual(["flow.closing"]);
    expect(o.remove("closing")).not.toBeNull();
    expect(o.piece("closing")?.querySelector('[data-mark="soon"]')).toBeNull();
    expect(text(o.piece("closing")?.querySelector("[data-piece-name]"))).toBe("Fase de cierre");
  });

  it("AC2: removing the closing phase moves it to «Para equipar», counts flow.closing: false and saves it with the dialog", async () => {
    const o = await open();
    await o.press(o.phase("closing"));
    await o.press(o.remove("closing"));
    expect(o.equipped()).toEqual(["retro", "after-landing"]);
    expect(o.library()).toEqual(["closing"]);
    expect(o.slots("closing")).toEqual(["retro", "after-landing"]);
    expect(o.count()).toBe("1");
    await o.press(o.review());
    expect(document.querySelector('sp-save-dialog [data-change="flow.closing"]')).not.toBeNull();
    await o.press(o.save());
    expect(saved).toEqual([[{ path: ["flow", "closing"], value: false }]]);
  });

  it("AC2: equipping the closing phase back takes flow.closing out of the file", async () => {
    const o = await open({ input: { ...PROJECT, flow: { closing: false } } });
    await o.press(o.phase("closing"));
    expect(o.library()).toEqual(["closing"]);
    await o.press(o.equip("closing"));
    expect(o.equipped()).toEqual(["closing", "retro", "after-landing"]);
    expect(o.count()).toBe("1");
    await o.press(o.review());
    await o.press(o.save());
    expect(saved).toEqual([[{ path: ["flow", "closing"] }]]);
  });

  it("AC8: turns delegated mode on with the preferences menu's dialog, at once in the clone, with nothing to save", async () => {
    const o = await open();
    await o.press(o.phase("review"));
    const control = o.piece("delegated")?.querySelector("sp-delegation-setting");
    expect(control).not.toBeNull();
    await o.press(control?.querySelector("sp-button button"));
    expect(o.dialog()).not.toBeNull();
    await o.press(o.button("Sí, que decida mi agente"));
    expect((await TestBed.inject(SpectyData).delegation())?.on).toBe(true);
    await o.settle();
    expect(o.equipped()).toEqual(["spec-approval", "delegated"]);
    expect(o.slots("review")).toEqual(["spec-approval", "delegated"]);
    expect(o.count()).toBe("0");
    expect(saved).toEqual([]);
  });

  it("AC10: read only, no piece can be equipped nor removed and their settings show their value", async () => {
    const o = await open({
      readOnly: { es: "lo arrancó el agente", en: "the agent started it" },
    });
    expect(o.equipped()).toContain("subagents");
    expect(o.flow()?.querySelector("[data-equip]")).toBeNull();
    expect(o.flow()?.querySelector("[data-remove]")).toBeNull();
    expect(o.flow()?.querySelector("[data-field]")).toBeNull();
    expect(text(o.piece("lines")?.querySelector('[data-setting="lines.warn"] [data-value]'))).toBe(
      "300",
    );
  });

  it("AC12: says the headings, the actions and the marks in English", async () => {
    const o = await open({ lang: "en" });
    expect(o.heading("equipped")).toBe("Equipped in Implementing");
    expect(o.heading("library")).toBe("To equip");
    expect(text(o.piece("subagents")?.querySelector("[data-remove]"))).toBe("Remove");
    expect(text(o.piece("pre-commit")?.querySelector("[data-equip]"))).toBe("Equip");
    expect(text(o.piece("guard")?.querySelector('[data-mark="guarantee"]'))).toBe(
      "Specty guarantee",
    );
    expect(text(o.piece("subagents")?.querySelector("[data-piece-name]"))).toBe("Subagents");
  });
});
