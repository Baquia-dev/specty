// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { DEFAULT_CONFIG, defaultGlossary, resolveConfig } from "@baquia-dev/specty-core";
import {
  type ConfigEdit,
  optionName,
  settingChanges,
  settingText,
} from "@baquia-dev/specty-core/light";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { ActionError, type Bilingual, type ChangeRecord, SpectyData } from "../data/records";
import type { ConfigCheck, ConfigRecord, ConfigSaved } from "../data/source";
import { deriveViews } from "../data/views";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
};

/** A project in Spanish with its own task verification, a longer time limit and tests as contract. */
const INPUT = {
  version: 1,
  language: "es",
  verify: { default: "pnpm test", timeoutSec: 2000 },
  policy: { tests: "contract" },
};

/** What the server gives for a valid `input`: what Specty uses, and the defaults in Spanish. */
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

let served: ConfigRecord = valid(INPUT);
let reason: Bilingual | undefined;
let refusal: Bilingual | undefined;
let saved: (readonly ConfigEdit[])[] = [];

/**
 * The prototype as the person's server: the configuration the test serves, checked by the core
 * as the server does, and saved into it with a commit unless the test refuses it.
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
    if (refusal !== undefined) return Promise.reject(new ActionError(refusal));
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

async function open(lang: "es" | "en" = "es", readOnly?: Bilingual) {
  served = valid(INPUT);
  reason = readOnly;
  refusal = undefined;
  saved = [];
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", lang);
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
  const row = (key: string) => page()?.querySelector<HTMLElement>(`[data-setting="${key}"]`);
  const field = (path: string) => page()?.querySelector<HTMLElement>(`[data-field="${path}"]`);
  const control = (path: string) => {
    const found = field(path)?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input[type="text"], textarea',
    );
    if (found === null || found === undefined) throw new Error(`no control for ${path}`);
    return found;
  };
  const press = async (button: Element | null | undefined) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error("no button");
    button.click();
    await settle();
  };
  const dialog = () => document.querySelector<HTMLElement>("sp-save-dialog");
  const change = (key: string) => dialog()?.querySelector<HTMLElement>(`[data-change="${key}"]`);
  return {
    element,
    settle,
    page,
    row,
    control,
    press,
    dialog,
    change,
    type: async (path: string, value: string) => {
      const input = control(path);
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await settle();
    },
    pick: async (path: string, value: string) => {
      field(path)
        ?.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)
        ?.click();
      await settle();
    },
    options: (path: string) =>
      [...(field(path)?.querySelectorAll("label[data-value]") ?? [])].map(text),
    review: () =>
      page()?.querySelector<HTMLButtonElement>('[data-actions="header"] [data-review] button'),
    discard: () =>
      page()?.querySelector<HTMLButtonElement>('[data-actions="header"] [data-discard] button'),
    reset: (key: string) => row(key)?.querySelector<HTMLButtonElement>("[data-reset] button"),
    save: () => dialog()?.querySelector<HTMLButtonElement>("[data-save] button"),
    confirm: () =>
      dialog()?.querySelector<HTMLInputElement>('[data-confirm] input[type="checkbox"]'),
    now: (key: string) => seen(change(key)?.querySelector("[data-now]")),
    added: (key: string) => [...(change(key)?.querySelectorAll("[data-now] ins") ?? [])].map(seen),
    before: (key: string) => change(key)?.querySelector<HTMLElement>("[data-before]"),
    removed: (key: string) =>
      [...(change(key)?.querySelectorAll("[data-before] del") ?? [])].map(seen),
    warnings: (key: string) =>
      [...(change(key)?.querySelectorAll("[data-warning]") ?? [])].map(text),
    marks: (key: string) =>
      [...(change(key)?.querySelectorAll<HTMLElement>("[data-mark]") ?? [])].map(
        (mark) => mark.dataset.mark,
      ),
  };
}

describe("«Revisar y guardar» in the settings page", () => {
  it("AC4: lists each change with its name, key and new value, «Antes» only when something was removed, and the warnings", async () => {
    const ui = await open();
    await ui.type("verify.timeoutSec", "2400");
    await ui.pick("scope.autoApprove", "none");
    await ui.type("governed", "**\nsrc/**");
    await ui.type("verify.default", "pnpm test --run");
    await ui.press(ui.review());
    const dialog = ui.dialog();
    expect(text(dialog?.querySelector("h2"))).toBe("Revisar y guardar");
    expect(text(dialog)).toContain("4 cambios en .specty/config.yaml");
    expect(
      [...(dialog?.querySelectorAll<HTMLElement>("[data-change]") ?? [])].map(
        (found) => found.dataset.change,
      ),
    ).toEqual(["verify.default", "verify.timeoutSec", "governed", "scope.autoApprove"]);
    const timeout = ui.change("verify.timeoutSec");
    expect(text(timeout?.querySelector("[data-name]"))).toBe(
      settingText("verify.timeoutSec", "es").name,
    );
    expect(text(timeout?.querySelector("[data-key]"))).toBe("verify.timeoutSec");
    expect(ui.now("verify.timeoutSec")).toBe("2400 s");
    expect(ui.added("verify.timeoutSec")).toEqual(["2400 s"]);
    expect(text(ui.before("verify.timeoutSec"))).toContain("Antes");
    expect(ui.removed("verify.timeoutSec")).toEqual(["2000 s"]);
    expect(ui.warnings("verify.timeoutSec")).toEqual([]);
    // Only added: no «Antes».
    expect(ui.now("governed")).toBe("**, src/**");
    expect(ui.added("governed")).toEqual(["src/**"]);
    expect(ui.before("governed")).toBeNull();
    // Affects permissions: its mark and its warning.
    expect(ui.now("scope.autoApprove")).toBe(optionName("scope.autoApprove", "none", "es"));
    expect(ui.removed("scope.autoApprove")).toEqual([
      optionName("scope.autoApprove", "tests-and-generated", "es"),
    ]);
    expect(ui.marks("scope.autoApprove")).toContain("permissions");
    expect(ui.warnings("scope.autoApprove").join(" ")).toContain("sin pedírtelo");
    // Runs a command: its mark and its warning; only words added, no «Antes».
    expect(ui.now("verify.default")).toBe("pnpm test --run");
    expect(ui.marks("verify.default")).toContain("command");
    expect(ui.warnings("verify.default").join(" ")).toContain("ejecutará este comando");
    expect(ui.before("verify.default")).toBeNull();
    const footnote = text(dialog?.querySelector("[data-footnote]"));
    expect(footnote).toContain("commit propio");
    expect(footnote).toContain("incorporar main");
  });

  it("AC5: asks for a separate confirmation before saving changes that affect permissions, and only then", async () => {
    const ui = await open();
    await ui.pick("scope.autoApprove", "none");
    await ui.press(ui.review());
    expect(ui.confirm()).not.toBeNull();
    expect(text(ui.dialog()?.querySelector("[data-confirm]"))).toContain("afectan permisos");
    expect(ui.save()?.disabled).toBe(true);
    ui.confirm()?.click();
    await ui.settle();
    expect(ui.save()?.disabled).toBe(false);
    await ui.press(ui.dialog()?.querySelector("[data-cancel] button"));
    expect(ui.dialog()).toBeNull();
    await ui.press(ui.discard());
    await ui.type("verify.timeoutSec", "2400");
    await ui.press(ui.review());
    expect(ui.confirm()).toBeNull();
    expect(ui.save()?.disabled).toBe(false);
  });

  it("AC6: saves only the edits, closes the dialog, tells the commit and reads the settings again", async () => {
    const ui = await open();
    await ui.type("verify.timeoutSec", "2400");
    await ui.press(ui.review());
    await ui.press(ui.save());
    expect(saved).toEqual([[{ path: ["verify", "timeoutSec"], value: 2400 }]]);
    expect(ui.dialog()).toBeNull();
    expect(text(ui.element)).toContain("abc1234");
    expect(ui.control("verify.timeoutSec").value).toBe("2400");
    expect(ui.page()?.querySelector('[data-mark="pending"]')).toBeNull();
    expect(text(ui.page()?.querySelector("[data-unsaved]"))).toBe("");
    expect(ui.review()?.disabled).toBe(true);
  });

  it("AC7: «Restablecer» and «Guardar» send the edit that removes the key, and the dialog says it goes back to its default", async () => {
    const ui = await open();
    await ui.press(ui.reset("verify.timeoutSec"));
    await ui.press(ui.review());
    expect(text(ui.change("verify.timeoutSec")?.querySelector("[data-reset-note]"))).toBe(
      "Vuelve al valor por defecto",
    );
    expect(ui.now("verify.timeoutSec")).toBe("600 s");
    expect(ui.removed("verify.timeoutSec")).toEqual(["2000 s"]);
    await ui.press(ui.save());
    expect(saved).toEqual([[{ path: ["verify", "timeoutSec"] }]]);
    expect(Object.keys(saved[0]?.[0] ?? {})).toEqual(["path"]);
    expect(ui.control("verify.timeoutSec").value).toBe("600");
    expect(ui.row("verify.timeoutSec")?.querySelector('[data-mark="modified"]')).toBeNull();
  });

  it("AC9: keeps the dialog open and says why when the server refuses to save", async () => {
    const ui = await open();
    refusal = {
      es: "Otra sesión tiene el turno de aterrizaje (accept, en /repo/.worktrees/x): vuelve a guardar cuando termine.",
      en: "Another session has the landing turn (accept, in /repo/.worktrees/x): save again when it finishes.",
    };
    await ui.type("verify.timeoutSec", "2400");
    await ui.press(ui.review());
    await ui.press(ui.save());
    expect(saved).toHaveLength(1);
    expect(ui.dialog()).not.toBeNull();
    expect(text(ui.dialog()?.querySelector('[role="alert"]'))).toContain(refusal.es);
    expect(text(ui.page()?.querySelector("[data-unsaved]"))).toBe("1 cambio sin guardar");
  });

  it("AC11: shows the controls, marks, actions, dialog, warnings and reasons in English", async () => {
    const ui = await open("en");
    expect(ui.options("subagents")).toEqual(["Yes", "No"]);
    expect(text(ui.reset("verify.timeoutSec"))).toBe("Reset");
    expect(text(ui.discard())).toBe("Discard");
    expect(text(ui.review())).toContain("Review and save");
    await ui.type("verify.timeoutSec", "2400");
    await ui.pick("scope.autoApprove", "none");
    await ui.type("verify.default", "pnpm test --run");
    expect(text(ui.row("verify.timeoutSec")?.querySelector('[data-mark="pending"]'))).toBe(
      "Unsaved",
    );
    expect(text(ui.page()?.querySelector("[data-unsaved]"))).toBe("3 unsaved changes");
    await ui.press(ui.review());
    const dialog = ui.dialog();
    expect(text(dialog?.querySelector("h2"))).toBe("Review and save");
    expect(text(dialog)).toContain("3 changes in .specty/config.yaml");
    expect(text(ui.before("verify.timeoutSec"))).toContain("Before");
    expect(ui.removed("verify.timeoutSec")).toEqual(["2000 s"]);
    expect(ui.warnings("scope.autoApprove").join(" ")).toContain("without asking you");
    expect(ui.warnings("verify.default").join(" ")).toContain("will run this command");
    expect(text(dialog?.querySelector("[data-confirm]"))).toContain("affect permissions");
    expect(text(dialog?.querySelector("[data-footnote]"))).toContain("own commit");
    expect(text(dialog?.querySelector("[data-cancel] button"))).toBe("Cancel");
    expect(text(dialog?.querySelector("[data-save] button"))).toBe("Save");
    await ui.press(dialog?.querySelector("[data-cancel] button"));
    await ui.press(ui.reset("verify.default"));
    await ui.press(ui.review());
    expect(text(ui.change("verify.default")?.querySelector("[data-reset-note]"))).toBe(
      "Back to its default",
    );
    await ui.press(ui.dialog()?.querySelector("[data-cancel] button"));
    const readOnly = await open("en", {
      es: "Este servidor es de solo lectura porque lo arrancó el agente.",
      en: "This server is read only because the agent started ui.",
    });
    const notice = text(readOnly.page()?.querySelector("[data-read-only]"));
    expect(notice).toContain("Read-only");
    expect(notice).toContain("This server is read only because the agent started ui.");
  });
});
