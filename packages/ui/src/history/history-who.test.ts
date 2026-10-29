// SPDX-License-Identifier: Apache-2.0
import { Component, input } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { HistoryEntry } from "../data/history";
import { HistoryTab } from "./history-tab";

/** Four events over two days: by a named person, by two agents, and by a person with no name. */
const EVENTS = [
  {
    at: "2026-10-28T09:00:00Z",
    actor: "human",
    by: "Ana Gómez",
    event: "spec.approved",
    type: "spec",
    title: { es: "Aprobó la revisión 1", en: "Approved revision 1" },
    details: [],
  },
  {
    at: "2026-10-28T10:00:00Z",
    actor: "agent",
    tool: "claude-code",
    model: "claude-opus-5-5",
    effort: "xhigh",
    event: "task.completed",
    type: "tasks",
    title: { es: "Completó T1", en: "Completed T1" },
    details: [],
  },
  {
    at: "2026-10-29T11:00:00Z",
    actor: "agent",
    tool: "codex",
    model: "gpt-5.5-codex",
    effort: "turbo",
    event: "task.completed",
    type: "tasks",
    title: { es: "Completó T2", en: "Completed T2" },
    details: [],
  },
  {
    at: "2026-10-29T12:00:00Z",
    actor: "human",
    event: "change.closed",
    type: "closing",
    title: { es: "Cambio cerrado", en: "Change closed" },
    details: [],
  },
] as const;

@Component({
  imports: [HistoryTab],
  template: `<sp-history-tab [history]="history()" />`,
})
class Host {
  readonly history = input<readonly HistoryEntry[]>(EVENTS);
}

async function render(lang: "es" | "en" = "es") {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  for (let round = 0; round < 10; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  const element: HTMLElement = fixture.nativeElement;
  const rows = [...element.querySelectorAll<HTMLElement>("[data-event]")];
  const text = (node: Element | undefined) => node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return { element, rows, text };
}

describe("who did each thing, in the History tab", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: names the person, and says «Persona» when the line has no name", async () => {
    const { rows, text } = await render();
    expect(text(rows[3])).toContain("Ana Gómez");
    expect(text(rows[3])).not.toContain("Persona");
    expect(text(rows[0])).toContain("Persona");
  });

  it("AC2: says the agent's tool, model and effort", async () => {
    const { rows, text } = await render();
    expect(text(rows[2])).toContain("Agente · Claude Code · Opus 5.5 · esfuerzo muy alto");
    // A model or an effort it does not know goes as it is.
    expect(text(rows[1])).toContain("Agente · Codex · gpt-5.5-codex · esfuerzo turbo");

    const english = await render("en");
    expect(english.text(english.rows[2])).toContain(
      "Agent · Claude Code · Opus 5.5 · extra-high effort",
    );
  });

  it("AC3: shows the newest day first, and in each day the newest event first", async () => {
    const { element, rows } = await render();
    expect(rows.map((row) => row.querySelector("time")?.getAttribute("datetime"))).toEqual(
      EVENTS.map((event) => event.at).toReversed(),
    );
    const days = [...element.querySelectorAll("[data-day]")];
    expect(days).toHaveLength(2);
    expect(days[0]?.querySelectorAll("[data-event]")).toHaveLength(2);
    expect(days[0]?.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-29T12:00:00Z");
  });
});
