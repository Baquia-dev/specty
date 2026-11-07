// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { DEFAULT_CONFIG, defaultGlossary, resolveConfig } from "@baquia-dev/specty-core";
import { SETTINGS } from "@baquia-dev/specty-core/light";
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

/** A project in Spanish with its own task verification and tests as contract. */
const INPUT = {
  version: 1,
  language: "es",
  verify: { default: "pnpm test", full: "pnpm check" },
  policy: { tests: "contract" },
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

/** The prototype, with the configuration the test serves. */
@Injectable()
class Configured extends FixtureData {
  override config(): Promise<ConfigRecord> {
    return Promise.resolve(valid(INPUT));
  }
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

/** The settings the basic mode of General shows, in the page's order. */
const BASIC = [
  "language",
  "mode",
  "policy.tests",
  "subagents",
  "retro.mode",
  "verify.default",
  "verify.full",
  "verify.timeoutSec",
  "git.worktrees",
  "git.flow",
  "git.afterLanding",
  "review.command",
];

/** Opens the page; `keep` keeps what this browser remembers from before, as a new visit does. */
async function open(options: { readonly lang?: "es" | "en"; readonly keep?: boolean } = {}) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  if (options.keep !== true) localStorage.clear();
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
  return {
    page,
    settle,
    choose,
    chosen: (which: "view" | "mode") =>
      page()?.querySelector<HTMLInputElement>(`[data-${which}] input[type="radio"]:checked`)?.value,
    options: (which: "view" | "mode") =>
      [...(page()?.querySelectorAll(`[data-${which}] label[data-value]`) ?? [])].map(text),
    rows: () =>
      [...(page()?.querySelectorAll<HTMLElement>("[data-setting]") ?? [])].map(
        (row) => row.dataset.setting,
      ),
    press: async (button: Element | null | undefined) => {
      if (!(button instanceof HTMLButtonElement)) throw new Error("no button");
      button.click();
      await settle();
    },
  };
}

describe("the view and the mode of the settings page", () => {
  it("AC11: opens the first time in the view General and in Advanced, as before", async () => {
    const { page, chosen, options } = await open();
    expect(options("view")).toEqual(["General", "Flujo"]);
    expect(options("mode")).toEqual(["Básico", "Avanzado"]);
    expect(chosen("view")).toBe("general");
    expect(chosen("mode")).toBe("advanced");
    expect(page()?.querySelector("[data-toolbar]")).not.toBeNull();
    expect(page()?.querySelector("sp-settings-flow")).toBeNull();
  });

  it("AC11: opens again in the view and the mode the person chose", async () => {
    const first = await open();
    await first.choose("view", "flow");
    await first.choose("mode", "basic");
    expect(first.page()?.querySelector("sp-settings-flow")).not.toBeNull();

    const again = await open({ keep: true });
    expect(again.chosen("view")).toBe("flow");
    expect(again.chosen("mode")).toBe("basic");
    expect(again.page()?.querySelector("sp-settings-flow")).not.toBeNull();
    expect(again.page()?.querySelector("[data-toolbar]")).toBeNull();

    await again.choose("view", "general");
    await again.choose("mode", "advanced");
    const third = await open({ keep: true });
    expect(third.chosen("view")).toBe("general");
    expect(third.chosen("mode")).toBe("advanced");
    expect(third.page()?.querySelector("sp-settings-flow")).toBeNull();
  });

  it("AC4: in Basic, General shows only the basic settings, with no search nor filters, and says how many more Advanced has", async () => {
    const { page, choose, chosen, rows, press } = await open();
    await choose("mode", "basic");
    expect(rows()).toEqual(BASIC);
    expect(page()?.querySelector("[data-toolbar]")).toBeNull();
    expect(page()?.querySelector('[data-section="internal"]')).toBeNull();
    const more = page()?.querySelector("[data-basic-more]");
    expect(text(more?.querySelector("p"))).toBe(
      `Ves 12 de ${SETTINGS.length} ajustes. Los demás conservan su valor y están en Avanzado.`,
    );
    expect(text(more?.querySelector("[data-show-advanced]"))).toBe("Ver todos en Avanzado");

    await press(more?.querySelector("[data-show-advanced] button"));
    expect(chosen("mode")).toBe("advanced");
    expect(page()?.querySelector("[data-toolbar]")).not.toBeNull();
    expect(page()?.querySelector("[data-basic-more]")).toBeNull();
    expect(rows()).toContain("governed");
    expect(rows().length).toBeGreaterThan(BASIC.length);
  });

  it("AC4: keeps the controls of the basic settings where the person can change them", async () => {
    const { page, choose } = await open();
    await choose("mode", "basic");
    expect(page()?.querySelector('[data-field="verify.default"] input')).not.toBeNull();
    expect(page()?.querySelector('[data-field="policy.tests"] input[type="radio"]')).not.toBeNull();
  });

  it("AC4: says it in English", async () => {
    const { page, choose, options } = await open({ lang: "en" });
    expect(options("view")).toEqual(["General", "Flow"]);
    expect(options("mode")).toEqual(["Basic", "Advanced"]);
    await choose("mode", "basic");
    const more = page()?.querySelector("[data-basic-more]");
    expect(text(more?.querySelector("p"))).toBe(
      `You see 12 of ${SETTINGS.length} settings. The others keep their value and are in Advanced.`,
    );
    expect(text(more?.querySelector("[data-show-advanced]"))).toBe("See all in Advanced");
  });
});
