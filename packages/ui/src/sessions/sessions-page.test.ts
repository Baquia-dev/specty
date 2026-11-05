// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import type { SessionView } from "@baquia-dev/specty-core/light";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
};

/** `minutes` before now, as an ISO date. */
const before = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/** Three sessions: one live on a change with its usage, one quiet in another folder, one old. */
@Injectable()
class ThreeSessions extends FixtureData {
  override sessions(): Promise<readonly SessionView[]> {
    return Promise.resolve([
      {
        tool: "claude-code",
        conversation: "s1",
        folder: ".worktrees/20261105-a",
        change: "20261105-a",
        first: before(180),
        last: before(2),
        live: true,
        usage: { tokens: 108_400, cost: 1.5 },
      },
      {
        tool: "codex",
        conversation: "t9",
        folder: ".worktrees/otro",
        first: before(150),
        last: before(120),
        live: false,
      },
      {
        tool: "gemini-cli",
        conversation: "g1",
        folder: "",
        first: before(5000),
        last: before(4400),
        live: false,
      },
    ]);
  }
}

/** No agent session has worked in the repository. */
@Injectable()
class NoSessions extends FixtureData {
  override sessions(): Promise<readonly SessionView[]> {
    return Promise.resolve([]);
  }
}

async function open(source: typeof FixtureData, lang: "es" | "en" = "es") {
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
      { provide: SpectyData, useClass: source },
      IN_THREAD,
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  const element: HTMLElement = fixture.nativeElement;
  await TestBed.inject(Router).navigateByUrl("/sessions");
  for (let round = 0; round < 40; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  const page = () => element.querySelector<HTMLElement>("sp-sessions-page");
  const row = (conversation: string) =>
    page()?.querySelector<HTMLElement>(`[data-session="${conversation}"]`);
  return { element, page, row };
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("the sessions page", () => {
  it("AC1: is in the navigation and shows each session, newest first, with where, when and what it spent", async () => {
    const { element, page, row } = await open(ThreeSessions);
    const link = [...element.querySelectorAll("nav a")].find((a) => text(a) === "Sesiones");
    expect(link?.getAttribute("href")).toBe("/sessions");
    expect(text(page()?.querySelector("[data-summary]"))).toBe("3 sesiones · 1 viva");
    const order = [...(page()?.querySelectorAll("[data-session]") ?? [])].map((item) =>
      item.getAttribute("data-session"),
    );
    expect(order).toEqual(["s1", "t9", "g1"]);
    const live = text(row("s1"));
    expect(live).toContain("claude-code");
    expect(live).toContain("viva");
    expect(live).toContain("empezó hace 3 h");
    expect(live).toContain("último paso hace 2 min");
    expect(live).toContain("108 mil tokens");
    expect(live).toContain("1,50 US$");
    expect(row("s1")?.querySelector("a")?.getAttribute("href")).toBe("/changes/20261105-a");
    const quiet = text(row("t9"));
    expect(quiet).toContain("codex");
    expect(quiet).toContain(".worktrees/otro");
    expect(quiet).toContain("sin actividad reciente");
    expect(quiet).not.toContain("tokens");
    expect(text(row("g1"))).toContain("carpeta principal");
    expect(text(row("g1"))).toContain("último paso hace 3 d");
  });

  it("AC1: speaks English too", async () => {
    const { page, row } = await open(ThreeSessions, "en");
    expect(text(page()?.querySelector("[data-summary]"))).toBe("3 sessions · 1 live");
    const live = text(row("s1"));
    expect(live).toContain("started 3 h ago");
    expect(live).toContain("last step 2 min ago");
    expect(live).toContain("108K tokens");
    expect(live).toContain("$1.50");
    expect(text(row("t9"))).toContain("no recent activity");
    expect(text(row("g1"))).toContain("main folder");
  });

  it("AC2: says so when no agent session has worked here", async () => {
    const { page } = await open(NoSessions);
    expect(page()?.querySelectorAll("[data-session]")).toHaveLength(0);
    expect(text(page())).toContain("Ninguna sesión de agente ha trabajado en este repositorio.");
  });
});
