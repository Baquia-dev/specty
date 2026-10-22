// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { RunRecord, VerificationView } from "../data/progress";
import { LiveOutput, MAX_LINES } from "./live-output";

const START = Date.parse("2026-10-22T12:00:00Z");
const RUN: RunRecord = {
  task: "T3",
  command: "flutter test test/reports",
  startedAt: new Date(START).toISOString(),
  output: ["00:00 +0: loading test/reports", "00:01 +1: renders the screen"],
};

@Component({
  imports: [LiveOutput],
  template: `<sp-live-output task="T3" [run]="run()" [verification]="verification()" />`,
})
class Host {
  readonly run = signal<RunRecord | undefined>(undefined);
  readonly verification = signal<VerificationView | undefined>(undefined);
}

/** `null` starts with no run (an `undefined` argument would take the default). */
async function render(run: RunRecord | null = RUN) {
  localStorage.setItem("specty.lang", "es");
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  // Only the clock is faked: change detection keeps its own timers.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(START);
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.run.set(run ?? undefined);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const log = () => element.querySelector<HTMLElement>("[data-log]");
  const settle = () => fixture.whenStable();
  return { fixture, host, element, log, settle };
}

/** jsdom does no layout: a log 1000 px tall seen through 200 px, scrolled by hand. */
function measure(log: HTMLElement): { top: () => number } {
  let top = 0;
  Object.defineProperty(log, "scrollHeight", { configurable: true, get: () => 1_000 });
  Object.defineProperty(log, "clientHeight", { configurable: true, get: () => 200 });
  Object.defineProperty(log, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = Math.min(value, 800);
    },
  });
  return { top: () => top };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("Live output", () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it("shows «Verificando», the clock, the command and the lines in their colors (AC1)", async () => {
    const { element, log, settle } = await render();
    expect(text(element.querySelector("[data-live] > div"))).toBe(
      "Verificando · 0:00 flutter test test/reports Ocultar salida",
    );
    expect(log()?.querySelectorAll(":scope > span")).toHaveLength(2);
    expect(
      [...(log()?.querySelectorAll("[data-tone=pass]") ?? [])].map((part) => part.textContent),
    ).toEqual(["+0", "+1"]);
    vi.advanceTimersByTime(42_000);
    await settle();
    expect(text(element.querySelector("[data-clock]"))).toBe("0:42");
  });

  it("follows the last line until the person scrolls up, and «Ir al final» goes back (AC2)", async () => {
    const { host, element, log, settle } = await render();
    const scroll = measure(log() ?? document.body);
    host.run.set({ ...RUN, output: [...RUN.output, "00:02 +2: shows the data"] });
    await settle();
    expect(scroll.top()).toBe(800);
    expect(element.querySelector("[data-to-end]")).toBeNull();

    // Up to read: new lines leave it there, and a way back appears.
    const scrolled = log();
    if (scrolled === null) throw new Error("no log");
    scrolled.scrollTop = 100;
    scrolled.dispatchEvent(new Event("scroll"));
    host.run.set({ ...RUN, output: [...RUN.output, "00:02 +2: a", "00:03 +3: b"] });
    await settle();
    expect(scroll.top()).toBe(100);
    element.querySelector<HTMLButtonElement>("[data-to-end]")?.click();
    await settle();
    expect(scroll.top()).toBe(800);
    expect(element.querySelector("[data-to-end]")).toBeNull();
    expect(document.activeElement).toBe(scrolled);
  });

  it("hides the output and shows it again, keeping the clock line (AC5)", async () => {
    const { element, log, settle } = await render();
    const toggle = element.querySelector<HTMLButtonElement>("[data-toggle]");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    toggle?.click();
    await settle();
    expect(log()).toBeNull();
    expect(text(element.querySelector("[data-live]"))).toBe(
      "Verificando · 0:00 flutter test test/reports Ver salida en vivo",
    );
    toggle?.click();
    await settle();
    expect(log()).not.toBeNull();
  });

  it("announces when a run starts, ends and how it went, never line by line (AC4)", async () => {
    const { host, element, settle } = await render(null);
    const said = () => text(element.querySelector("[data-announce]"));
    expect(said()).toBe("");
    host.run.set(RUN);
    await settle();
    expect(said()).toBe("Verificando T3: flutter test test/reports.");
    host.run.set({ ...RUN, output: [...RUN.output, "00:02 +2: more"] });
    await settle();
    expect(said()).toBe("Verificando T3: flutter test test/reports.");
    host.run.set(undefined);
    await settle();
    expect(said()).toBe("Terminó la verificación de T3.");
    expect(element.querySelector("[data-live]")).toBeNull();
    host.verification.set({
      at: "2026-10-22T12:00:08Z",
      command: RUN.command,
      passed: false,
      ms: 8_000,
      output: ["00:06 +5 -1: Some tests failed."],
    });
    await settle();
    expect(said()).toBe("La verificación de T3 falló.");
  });

  it("keeps the last lines on screen and counts the earlier ones", async () => {
    const output = Array.from({ length: MAX_LINES + 20 }, (_, index) => `line ${index + 1}`);
    const { element, log } = await render({ ...RUN, output });
    expect(text(element.querySelector("[data-hidden]"))).toBe("… 20 líneas antes");
    expect(log()?.querySelectorAll(":scope > span:not([data-hidden])")).toHaveLength(MAX_LINES);
    expect(text(log()?.lastElementChild)).toBe(`line ${MAX_LINES + 20}`);
  });
});
