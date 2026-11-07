// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { DEFAULT_CONFIG, defaultGlossary, resolveConfig } from "@baquia-dev/specty-core";
import { SETTINGS, settingText } from "@baquia-dev/specty-core/light";
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

/** A project in Spanish with its own task verification, a longer time limit and tests as contract. */
const INPUT = {
  version: 1,
  language: "es",
  verify: { default: "pnpm test", timeoutSec: 2000 },
  policy: { tests: "contract" },
};

/** What the server gives for a valid `input`: what Specty uses, and the defaults in Spanish. */
function valid(input: Readonly<Record<string, unknown>>): ConfigRecord {
  const result = resolveConfig(input);
  if (!result.ok) throw new Error("the sample is not valid");
  return {
    input,
    config: result.config,
    defaults: { ...DEFAULT_CONFIG, glossary: defaultGlossary("es") },
    issues: [],
  };
}

/** A file that is not valid: a value of the wrong type, sizes that do not grow, a key inside a group and one unknown. */
const INVALID: ConfigRecord = {
  input: {
    version: 1,
    size: { M: 30 },
    verify: { timeoutSec: "mucho", slots: 4 },
    checks: { functions: { maxLines: 0 } },
    futuro: true,
  },
  defaults: DEFAULT_CONFIG,
  issues: [
    { path: "verify.timeoutSec", message: "Invalid input: expected number, received string" },
    { path: "size", message: "Thresholds must grow: S < M < L." },
    { path: "checks.functions.maxLines", message: "Too small: expected number to be >0" },
    { path: "", message: 'Unrecognized key: "futuro"' },
  ],
};

let served: ConfigRecord = valid(INPUT);

/** The prototype, with the configuration the test serves. */
@Injectable()
class Configured extends FixtureData {
  override config(): Promise<ConfigRecord> {
    return Promise.resolve(served);
  }
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

async function open(record: ConfigRecord, lang: "es" | "en" = "es", url = "/settings") {
  served = record;
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
  await TestBed.inject(Router).navigateByUrl(url);
  await settle();
  const page = () => element.querySelector<HTMLElement>("sp-settings-page");
  const row = (key: string) => page()?.querySelector<HTMLElement>(`[data-setting="${key}"]`);
  const all = (selector: string, within: Element | null | undefined = page()) => [
    ...(within?.querySelectorAll<HTMLElement>(selector) ?? []),
  ];
  return {
    element,
    settle,
    page,
    row,
    all,
    keys: () => all("[data-setting]").map((found) => found.dataset.setting),
    sections: () => all("section[data-section]").map((found) => found.dataset.section),
    headings: () => all("section[data-section] h2").map(text),
    part: (key: string, name: string) => text(row(key)?.querySelector(`[data-${name}]`)),
    items: (key: string) => all("[data-value] [data-item]", row(key)).map(text),
    marks: (key: string) => all("[data-mark]", row(key)).map((mark) => mark.dataset.mark),
    mark: (key: string, name: string) => text(row(key)?.querySelector(`[data-mark="${name}"]`)),
    issues: (key: string) => all("[data-issue]", row(key)).map(text),
    filters: () => all("[data-toolbar] label[data-value]").map(text),
    search: async (value: string) => {
      const input = page()?.querySelector<HTMLInputElement>('input[type="search"]');
      if (input === null || input === undefined) throw new Error("no search");
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await settle();
    },
    choose: async (filter: string) => {
      page()?.querySelector<HTMLInputElement>(`input[type="radio"][value="${filter}"]`)?.click();
      await settle();
    },
  };
}

const SECTIONS = [
  "flow",
  "verify",
  "git",
  "review",
  "scope",
  "size",
  "lines",
  "checks",
  "team",
  "memory",
  "dev",
  "ui",
  "effort",
  "glossary",
  "internal",
];

describe("the settings page", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: opens from the header and shows each setting by section, with its name, description, key and value", async () => {
    const { element, settle, page, sections, headings, keys, part, items, marks, mark } =
      await open(valid(INPUT), "es", "/");
    const link = element.querySelector<HTMLAnchorElement>('header nav a[href="/settings"]');
    expect(text(link)).toBe("Configuración");
    link?.click();
    await settle();
    expect(text(page()?.querySelector("h1"))).toBe("Configuración");
    expect(sections()).toEqual(SECTIONS);
    expect(headings()).toEqual([
      "Flujo",
      "Verificación",
      "Git",
      "Revisión independiente",
      "Alcance",
      "Tamaño y cortes",
      "Líneas de código",
      "Verificaciones de calidad",
      "Equipo",
      "Memoria",
      "Desarrollo",
      "Interfaz",
      "Esfuerzo recomendado",
      "Glosario",
      "Interno",
    ]);
    expect(keys()).toEqual(SETTINGS.map((setting) => setting.key));
    const timeout = settingText("verify.timeoutSec", "es");
    expect(part("verify.timeoutSec", "name")).toBe(timeout.name);
    expect(part("verify.timeoutSec", "description")).toBe(timeout.description);
    expect(part("verify.timeoutSec", "key")).toBe("verify.timeoutSec");
    expect(part("verify.timeoutSec", "value")).toBe("2000 s");
    expect(mark("verify.timeoutSec", "modified")).toBe("Modificado");
    expect(part("verify.timeoutSec", "default")).toBe("Por defecto: 600 s");
    expect(part("policy.tests", "value")).toBe("Contrato");
    expect(part("policy.tests", "default")).toBe("Por defecto: Recomendados");
    expect(part("language", "value")).toBe("Español");
    expect(part("language", "default")).toBe("Por defecto: English");
    expect(part("verify.default", "value")).toBe("pnpm test");
    expect(marks("verify.default")).toContain("modified");
    // Unchanged: no mark and no default line, the glossary of its own language included.
    for (const key of ["verify.slots", "glossary", "mode"]) {
      expect(marks(key), key).not.toContain("modified");
      expect(part(key, "default"), key).toBe("");
    }
    expect(part("verify.slots", "value")).toBe("2");
    expect(part("memory.orphanAfterMin", "value")).toBe("60 min");
    expect(part("subagents", "value")).toBe("Sí");
    expect(items("size")).toEqual(["S: 4", "M: 10", "L: 18"]);
    // A long list shows its first six and how many more there are.
    expect(items("checks.exclude")).toHaveLength(6);
    expect(part("checks.exclude", "more")).toBe("y 5 más");
    expect(part("specty delegate", "key")).toBe("specty delegate");
    expect(part("specty delegate", "value")).toBe("No");
    expect(text(page()?.querySelector("[data-summary]"))).toContain("4 modificados");
    expect(text(page()?.querySelector("[data-read-only]"))).toContain("Solo lectura");
    expect(page()?.querySelector("[data-invalid]")).toBeNull();
  });

  it("AC2: marks what affects permissions, runs a command, lives in the clone or has no effect yet, with no control to change it", async () => {
    const { page, marks, mark } = await open(valid(INPUT));
    const flags = ["permissions", "command", "clone", "soon", "new", "guarantee"] as const;
    for (const setting of SETTINGS) {
      expect(
        marks(setting.key).filter((name) => name !== "modified"),
        setting.key,
      ).toEqual(flags.filter((flag) => setting[flag] === true));
    }
    expect(mark("policy.tests", "permissions")).toBe("Afecta permisos");
    expect(mark("scope.autoApprove", "permissions")).toBe("Afecta permisos");
    expect(mark("verify.default", "command")).toBe("Ejecuta un comando");
    expect(mark("specty delegate", "clone")).toBe("Este clon");
    for (const key of [
      "sizing.highFanIn",
      "team.approvers",
      "team.requirePrReview",
      "ui.requireUserPresence",
    ]) {
      expect(mark(key, "soon"), key).toBe("Próximamente");
    }
    const controls = page()?.querySelectorAll(
      "[data-setting] input, [data-setting] select, [data-setting] textarea, [data-setting] button",
    );
    expect(controls).toHaveLength(0);
  });

  it("AC3: keeps only the settings whose name, description or key match the search, without accents or capitals", async () => {
    const { page, keys, sections, search } = await open(valid(INPUT));
    await search("VERIFY.SLOTS");
    expect(keys()).toEqual(["verify.slots"]);
    expect(sections()).toEqual(["verify"]);
    await search("tiempo maximo por comando");
    expect(keys()).toEqual(["verify.timeoutSec"]);
    await search(settingText("git.afterLanding", "es").description.toUpperCase());
    expect(keys()).toEqual(["git.afterLanding"]);
    await search("nada de esto existe");
    expect(keys()).toEqual([]);
    expect(sections()).toEqual([]);
    expect(text(page()?.querySelector("[data-no-match]"))).toBe("Nada coincide con el filtro.");
  });

  it("AC6, AC7: shows the new settings of the size and the effort with «Nuevo», their key and value, in Spanish and in English", async () => {
    const input = { ...INPUT, sizing: { weights: { create: 2 } }, effort: { S: { plan: "high" } } };
    const es = await open(valid(input));
    expect(es.headings()).toContain("Esfuerzo recomendado");
    for (const key of [
      "sizing.weights",
      "sizing.tasksWithoutWeight",
      "sizing.highFanIn",
      "sizing.nearRatio",
      "effort.S",
      "effort.M",
      "effort.L",
      "effort.XL",
      "effort.task",
    ]) {
      expect(es.mark(key, "new"), key).toBe("Nuevo");
      expect(es.part(key, "key"), key).toBe(key);
      expect(es.part(key, "name"), key).toBe(settingText(key, "es").name);
    }
    expect(es.mark("sizing.highFanIn", "soon")).toBe("Próximamente");
    expect(es.part("sizing.tasksWithoutWeight", "value")).toBe("3");
    expect(es.part("sizing.nearRatio", "value")).toBe("0.8");
    expect(es.items("sizing.weights")).toContain("create: 2");
    expect(es.marks("sizing.weights")).toContain("modified");
    expect(es.items("effort.S")).toEqual(["plan: high", "implement: low"]);
    expect(es.marks("effort.S")).toContain("modified");
    expect(es.items("effort.task")).toEqual(["lowMaxFiles: 1", "highMinFiles: 4"]);
    expect(es.marks("effort.task")).not.toContain("modified");
    const en = await open(valid(input), "en");
    expect(en.headings()).toContain("Recommended effort");
    expect(en.mark("effort.task", "new")).toBe("New");
    expect(en.part("effort.task", "name")).toBe(settingText("effort.task", "en").name);
    expect(en.part("sizing.nearRatio", "description")).toBe(
      settingText("sizing.nearRatio", "en").description,
    );
  });

  it("AC3: filters by mark, with how many settings each filter has, and the search narrows the filter", async () => {
    const { page, keys, filters, choose, search } = await open(valid(INPUT));
    const count = (flag: "permissions" | "command" | "new") =>
      SETTINGS.filter((setting) => setting[flag] === true).map((setting) => setting.key);
    expect(filters()).toEqual([
      `Todos · ${SETTINGS.length}`,
      "Modificados · 4",
      `Afectan permisos · ${count("permissions").length}`,
      `Ejecutan comandos · ${count("command").length}`,
      `Nuevos · ${count("new").length}`,
    ]);
    await choose("modified");
    expect(keys()).toEqual(["language", "policy.tests", "verify.default", "verify.timeoutSec"]);
    await search("tiempo");
    expect(keys()).toEqual(["verify.timeoutSec"]);
    await search("");
    await choose("permissions");
    expect(keys()).toEqual(count("permissions"));
    await choose("command");
    expect(keys()).toEqual(count("command"));
    await choose("new");
    expect(keys()).toEqual(count("new"));
    await search("nada de esto existe");
    expect(text(page()?.querySelector("[data-no-match]"))).toBe("Nada coincide con el filtro.");
    await search("");
    await choose("all");
    expect(keys()).toHaveLength(SETTINGS.length);
  });

  it("AC4: warns that the file is not valid and shows each issue by its setting, the rest on top, with the file's values or the defaults", async () => {
    const { page, all, part, items, issues } = await open(INVALID);
    const invalid = page()?.querySelector("[data-invalid]");
    expect(invalid?.getAttribute("role")).toBe("alert");
    expect(text(invalid)).toContain("no es válido");
    expect(all("[data-loose-issue]", invalid).map(text)).toEqual(['Unrecognized key: "futuro"']);
    expect(issues("verify.timeoutSec")).toEqual([
      "Invalid input: expected number, received string",
    ]);
    expect(part("verify.timeoutSec", "value")).toBe("mucho");
    expect(part("verify.timeoutSec", "default")).toBe("Por defecto: 600 s");
    expect(issues("size")).toEqual(["Thresholds must grow: S < M < L."]);
    expect(items("size")).toEqual(["M: 30"]);
    expect(issues("split")).toEqual([]);
    expect(issues("lanes.quick.maxFiles")).toEqual([]);
    expect(issues("checks.functions")).toEqual(["maxLines: Too small: expected number to be >0"]);
    expect(part("verify.slots", "value")).toBe("4");
    expect(issues("verify.slots")).toEqual([]);
    expect(part("verify.quick", "value")).toBe("Sin valor");
    expect(part("memory.orphanAfterMin", "value")).toBe("60 min");
  });

  it("AC5: shows the title, sections, settings, options, marks and filters in English", async () => {
    const { element, page, headings, part, mark, filters } = await open(valid(INPUT), "en");
    expect(text(element.querySelector('header nav a[href="/settings"]'))).toBe("Settings");
    expect(text(page()?.querySelector("h1"))).toBe("Settings");
    expect(headings().slice(0, 4)).toEqual(["Flow", "Verification", "Git", "Independent review"]);
    const timeout = settingText("verify.timeoutSec", "en");
    expect(part("verify.timeoutSec", "name")).toBe(timeout.name);
    expect(part("verify.timeoutSec", "description")).toBe(timeout.description);
    expect(mark("verify.timeoutSec", "modified")).toBe("Modified");
    expect(part("verify.timeoutSec", "default")).toBe("Default: 600 s");
    expect(part("policy.tests", "value")).toBe("Contract");
    expect(part("subagents", "value")).toBe("Yes");
    expect(mark("policy.tests", "permissions")).toBe("Affects permissions");
    expect(mark("verify.default", "command")).toBe("Runs a command");
    expect(mark("specty delegate", "clone")).toBe("This clone");
    expect(mark("ui.port", "soon")).toBe("");
    expect(mark("team.approvers", "soon")).toBe("Coming soon");
    expect(filters().map((label) => label.replace(/ · \d+$/, ""))).toEqual([
      "All",
      "Modified",
      "Affect permissions",
      "Run commands",
      "New",
    ]);
    expect(text(page()?.querySelector("[data-read-only]"))).toContain("Read-only");
  });

  /** The section «Interno» of the page, its toggle and whether its settings are folded away. */
  const internalOf = (page: () => HTMLElement | null) => {
    const section = () => page()?.querySelector<HTMLElement>('section[data-section="internal"]');
    const toggle = () => section()?.querySelector<HTMLButtonElement>("button[aria-expanded]");
    return {
      section,
      toggle,
      folded: () =>
        toggle()?.getAttribute("aria-expanded") === "false" &&
        section()?.querySelector("[data-setting]")?.closest("[inert]") !== null,
      open: () =>
        toggle()?.getAttribute("aria-expanded") === "true" &&
        section()?.querySelector("[data-setting]")?.closest("[inert]") === null,
    };
  };

  it("AC6: shows «Interno» last, folded, with a warning; opened, its settings with «Nuevo», key, value and default", async () => {
    const changed = valid({ ...INPUT, internal: { waits: { waitTimeoutSec: 600 } } });
    const { page, settle, sections, headings, part, mark, marks } = await open(changed);
    expect(sections().at(-1)).toBe("internal");
    expect(headings().at(-1)).toBe("Interno");
    const internal = internalOf(page);
    const warning = text(internal.section()?.querySelector("[data-internal-warning]"));
    expect(warning).toContain("sin funcionar");
    expect(warning).toContain("quita su clave");
    expect(internal.folded()).toBe(true);
    internal.toggle()?.click();
    await settle();
    expect(internal.open()).toBe(true);
    expect(part("internal.waits.waitTimeoutSec", "key")).toBe("internal.waits.waitTimeoutSec");
    expect(part("internal.waits.waitTimeoutSec", "value")).toBe("600 s");
    expect(part("internal.waits.waitTimeoutSec", "default")).toBe("Por defecto: 3600 s");
    expect(marks("internal.waits.waitTimeoutSec")).toEqual(["modified", "new"]);
    expect(mark("internal.waits.heartbeatSec", "new")).toBe("Nuevo");
    expect(part("internal.waits.heartbeatSec", "value")).toBe("60 s");
    expect(part("internal.waits.heartbeatSec", "default")).toBe("");
    expect(part("internal.retries.landing", "value")).toBe("2");
  });

  it("AC6: opens «Interno» by itself while a search or a filter shows its settings", async () => {
    const { page, keys, search, choose } = await open(valid(INPUT));
    const internal = internalOf(page);
    expect(internal.folded()).toBe(true);
    await search("internal.retries");
    expect(keys()).toEqual(["internal.retries.landing"]);
    expect(internal.open()).toBe(true);
    await search("");
    expect(internal.folded()).toBe(true);
    await choose("new");
    expect(keys()).toEqual([
      "sizing.weights",
      "sizing.tasksWithoutWeight",
      "sizing.highFanIn",
      "sizing.nearRatio",
      "effort.S",
      "effort.M",
      "effort.L",
      "effort.XL",
      "effort.task",
      "internal.waits.waitTimeoutSec",
      "internal.waits.heartbeatSec",
      "internal.retries.landing",
      "internal.exec.priority",
      "internal.server.portsTried",
    ]);
    expect(internal.open()).toBe(true);
  });

  it("AC5: shows the four lives of compliance as guarantees, with a lock, their fixed 24 h and why, with no key nor control", async () => {
    const { page, row, part, items, marks, mark } = await open(valid(INPUT));
    for (const key of [
      "guarantee.receipts",
      "guarantee.guardPending",
      "guarantee.shellSnapshots",
      "guarantee.sessions",
    ]) {
      expect(row(key)?.closest('section[data-section="internal"]'), key).not.toBeNull();
      expect(marks(key), key).toEqual(["guarantee"]);
      expect(row(key)?.querySelector("[data-lock]"), key).not.toBeNull();
      expect(items(key), key).toEqual(["24 h"]);
      expect(row(key)?.querySelector("[data-key]"), key).toBeNull();
      expect(part(key, "default"), key).toBe("");
      expect(part(key, "description"), key).toBe(settingText(key, "es").description);
    }
    expect(mark("guarantee.receipts", "guarantee")).toBe("Garantía");
    expect(part("guarantee.receipts", "description")).toContain("24 h");
    const controls = internalOf(page)
      .section()
      ?.querySelectorAll(
        "[data-setting] input, [data-setting] select, [data-setting] textarea, [data-setting] button",
      );
    expect(controls).toHaveLength(0);
  });

  it("AC7: shows «Interno», its warning, the guarantees and the internal settings in English", async () => {
    const { page, headings, part, mark } = await open(valid(INPUT), "en");
    expect(headings().at(-1)).toBe("Internal");
    const warning = text(internalOf(page).section()?.querySelector("[data-internal-warning]"));
    expect(warning).toContain("stop working");
    expect(warning).toContain("remove its key");
    expect(mark("guarantee.receipts", "guarantee")).toBe("Guarantee");
    for (const key of SETTINGS.filter((setting) => setting.section === "internal").map(
      (setting) => setting.key,
    )) {
      expect(part(key, "name"), key).toBe(settingText(key, "en").name);
      expect(part(key, "description"), key).toBe(settingText(key, "en").description);
    }
  });

  /** The settings of execution and of the server that were fixed in Specty's code until C9. */
  const RUN = ["internal.exec.priority", "internal.server.portsTried"];

  it("AC5: shows the verifications' priority and the ports the UI tries in «Interno», the last section, marked «Nuevo», and ui.port is no longer «Próximamente»", async () => {
    const { sections, headings, row, part, marks, mark } = await open(valid(INPUT));
    expect(sections().at(-1)).toBe("internal");
    expect(headings().at(-1)).toBe("Interno");
    for (const key of RUN) {
      expect(row(key)?.closest('section[data-section="internal"]'), key).not.toBeNull();
      expect(mark(key, "new"), key).toBe("Nuevo");
      expect(part(key, "key"), key).toBe(key);
      expect(part(key, "name"), key).toBe(settingText(key, "es").name);
    }
    expect(part("internal.exec.priority", "value")).toBe("10");
    expect(part("internal.server.portsTried", "value")).toBe("20");
    expect(marks("ui.port")).not.toContain("soon");
    expect(part("ui.port", "value")).toBe("auto");
  });

  it("AC5: shows a configured internal setting as modified, with today's value as its default", async () => {
    const { part, mark } = await open(
      valid({ ...INPUT, internal: { exec: { priority: 15 }, server: { portsTried: 5 } } }),
    );
    expect(part("internal.exec.priority", "value")).toBe("15");
    expect(mark("internal.exec.priority", "modified")).toBe("Modificado");
    expect(part("internal.exec.priority", "default")).toBe("Por defecto: 10");
    expect(part("internal.server.portsTried", "value")).toBe("5");
    expect(part("internal.server.portsTried", "default")).toBe("Por defecto: 20");
  });

  it("AC6: names the section «Interno» and its settings in English", async () => {
    const { headings, part, mark } = await open(valid(INPUT), "en");
    expect(headings().at(-1)).toBe("Internal");
    for (const key of RUN) {
      expect(mark(key, "new"), key).toBe("New");
      expect(part(key, "name"), key).toBe(settingText(key, "en").name);
      expect(part(key, "description"), key).toBe(settingText(key, "en").description);
      expect(settingText(key, "en").name, key).not.toBe(settingText(key, "es").name);
    }
  });
});
