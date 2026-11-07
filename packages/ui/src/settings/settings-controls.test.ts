// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { DEFAULT_CONFIG, defaultGlossary, resolveConfig } from "@baquia-dev/specty-core";
import {
  type ConfigEdit,
  optionName,
  SETTINGS,
  settingChanges,
  settingOf,
} from "@baquia-dev/specty-core/light";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type Bilingual, type ChangeRecord, SpectyData } from "../data/records";
import type { ConfigCheck, ConfigRecord } from "../data/source";
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

/** The prototype, with the configuration the test serves, checked by the core as the server does. */
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
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

async function open(record: ConfigRecord, readOnly?: Bilingual) {
  served = record;
  reason = readOnly;
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", "es");
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
  const actions = () => page()?.querySelector<HTMLElement>('[data-actions="header"]');
  return {
    page,
    row,
    field,
    control,
    actions,
    press,
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
    checked: (path: string) =>
      field(path)?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value,
    options: (path: string) =>
      [...(field(path)?.querySelectorAll("label[data-value]") ?? [])].map(text),
    marks: (key: string) =>
      [...(row(key)?.querySelectorAll<HTMLElement>("[data-mark]") ?? [])].map(
        (mark) => mark.dataset.mark,
      ),
    issues: (key: string) => [...(row(key)?.querySelectorAll("[data-issue]") ?? [])].map(text),
    controlsIn: (key: string) =>
      row(key)?.querySelectorAll("input, select, textarea, button").length ?? 0,
    unsaved: () => text(page()?.querySelector("[data-unsaved]")),
    count: (where: "header" | "bar") =>
      text(page()?.querySelector(`[data-actions="${where}"] [data-review] [data-count]`)),
    review: () => actions()?.querySelector<HTMLButtonElement>("[data-review] button"),
    discard: () => actions()?.querySelector<HTMLButtonElement>("[data-discard] button"),
    reset: (key: string) => row(key)?.querySelector<HTMLButtonElement>("[data-reset] button"),
  };
}

describe("the controls of the settings page", () => {
  it("AC1: gives each setting the UI saves its control, with the file's value or its default, and none to the rest", async () => {
    const { row, field, control, checked, options, controlsIn } = await open(valid(INPUT));
    expect(control("verify.timeoutSec").value).toBe("2000");
    expect(text(field("verify.timeoutSec")?.querySelector("[data-unit]"))).toBe("s");
    expect(control("verify.slots").value).toBe("2");
    expect(control("verify.default").value).toBe("pnpm test");
    expect(checked("policy.tests")).toBe("contract");
    expect(options("policy.tests")).toEqual(
      (SETTINGS.find((setting) => setting.key === "policy.tests")?.options ?? []).map((option) =>
        optionName("policy.tests", option, "es"),
      ),
    );
    expect(checked("subagents")).toBe("true");
    expect(options("subagents")).toEqual(["Sí", "No"]);
    expect(control("governed").tagName).toBe("TEXTAREA");
    expect(control("governed").value).toBe("**");
    expect(control("size.M").value).toBe("10");
    expect(text(field("size.M"))).toContain("M");
    expect(control("checks.levels").value).toBe("");
    for (const setting of SETTINGS) {
      const editable = settingOf(setting.key.split(".")) !== undefined;
      expect(
        (row(setting.key)?.querySelectorAll("[data-field]").length ?? 0) > 0,
        setting.key,
      ).toBe(editable);
    }
    for (const key of [
      "team.approvers",
      "effort",
      "guarantee.receipts",
      "specty delegate",
      "verify.units",
      "checks.layers",
    ]) {
      expect(controlsIn(key), key).toBe(0);
      expect(row(key)?.querySelector("[data-item]"), key).not.toBeNull();
    }
  });

  it("AC2: marks each changed setting «Sin guardar», counts the changes in the header and «Descartar» brings back the file's values", async () => {
    const { page, control, type, pick, checked, marks, unsaved, count, review, discard, press } =
      await open(valid(INPUT));
    expect(unsaved()).toBe("");
    expect(review()?.disabled).toBe(true);
    await type("verify.timeoutSec", "2400");
    expect(marks("verify.timeoutSec")).toContain("pending");
    expect(
      text(page()?.querySelector('[data-setting="verify.timeoutSec"] [data-mark="pending"]')),
    ).toBe("Sin guardar");
    expect(unsaved()).toBe("1 cambio sin guardar");
    expect(count("header")).toBe("1");
    expect(count("bar")).toBe("1");
    expect(review()?.disabled).toBe(false);
    await pick("policy.tests", "required");
    expect(marks("policy.tests")).toContain("pending");
    expect(unsaved()).toBe("2 cambios sin guardar");
    expect(count("header")).toBe("2");
    // Back to the file's value: no longer a change.
    await type("verify.timeoutSec", "2000");
    expect(marks("verify.timeoutSec")).not.toContain("pending");
    expect(unsaved()).toBe("1 cambio sin guardar");
    await type("verify.timeoutSec", "2400");
    await press(discard());
    expect(control("verify.timeoutSec").value).toBe("2000");
    expect(checked("policy.tests")).toBe("contract");
    expect(page()?.querySelector('[data-mark="pending"]')).toBeNull();
    expect(unsaved()).toBe("");
    expect(review()?.disabled).toBe(true);
  });

  it("AC3: shows the validator's error by its control and does not let save, saying why", async () => {
    const { type, issues, review, actions } = await open(valid(INPUT));
    await type("size.M", "30");
    expect(issues("size")).toHaveLength(1);
    expect(issues("size")[0]).toContain("S < M < L");
    expect(review()?.disabled).toBe(true);
    expect(text(actions()?.querySelector("[data-review] [role=tooltip]"))).toContain("Corrige");
    await type("verify.timeoutSec", "mucho");
    expect(issues("verify.timeoutSec")).toHaveLength(1);
    expect(issues("verify.timeoutSec")[0]).toContain("number");
    await type("size.M", "12");
    await type("verify.timeoutSec", "2400");
    expect(issues("size")).toEqual([]);
    expect(issues("verify.timeoutSec")).toEqual([]);
    expect(review()?.disabled).toBe(false);
  });

  it("AC7: offers «Restablecer» on a setting in the file, and then its control shows the default", async () => {
    const { control, marks, unsaved, reset, press } = await open(valid(INPUT));
    expect(reset("verify.timeoutSec")).not.toBeNull();
    expect(reset("policy.tests")).not.toBeNull();
    expect(reset("verify.slots")).toBeNull();
    expect(text(reset("verify.timeoutSec"))).toBe("Restablecer");
    await press(reset("verify.timeoutSec"));
    expect(control("verify.timeoutSec").value).toBe("600");
    expect(marks("verify.timeoutSec")).toContain("pending");
    expect(unsaved()).toBe("1 cambio sin guardar");
    expect(reset("verify.timeoutSec")).toBeNull();
  });

  it("AC8: with a server the agent started, shows no control, no «Restablecer» nor «Revisar y guardar», and says why it is read-only", async () => {
    const agent = {
      es: "Este servidor es de solo lectura porque lo arrancó el agente.",
      en: "This server is read only because the agent started it.",
    };
    const { page, controlsIn, actions } = await open(valid(INPUT), agent);
    for (const setting of SETTINGS) expect(controlsIn(setting.key), setting.key).toBe(0);
    expect(page()?.querySelector("[data-field]")).toBeNull();
    expect(actions()).toBeNull();
    expect(page()?.querySelector('[data-actions="bar"]')).toBeNull();
    const notice = text(page()?.querySelector("[data-read-only]"));
    expect(notice).toContain("Solo lectura");
    expect(notice).toContain(agent.es);
  });

  it("AC9: when the server says the settings cannot be saved, the page is read-only and gives the reason", async () => {
    const blocked = {
      es: "`.specty/config.yaml` tiene cambios sin commit: haz su commit o descártalos para guardar desde aquí.",
      en: "`.specty/config.yaml` has uncommitted changes: commit or discard them to save from here.",
    };
    const { page, controlsIn, actions } = await open({ ...valid(INPUT), blocked });
    for (const setting of SETTINGS) expect(controlsIn(setting.key), setting.key).toBe(0);
    expect(actions()).toBeNull();
    const notice = text(page()?.querySelector("[data-read-only]"));
    expect(notice).toContain("Solo lectura");
    expect(notice).toContain(blocked.es);
  });
});
