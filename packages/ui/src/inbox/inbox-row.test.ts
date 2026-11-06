// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { sampleRecords } from "../data/fixtures";
import type { ChangeView } from "../data/records";
import { deriveViews } from "../data/views";
import { InboxRow } from "./inbox-row";

const LOGIN = "20261021-login-google";

function viewOf(id: string): ChangeView {
  const found = deriveViews(sampleRecords(Date.now())).find((view) => view.id === id);
  if (found === undefined) throw new Error(`no sample ${id}`);
  return found;
}

@Component({
  imports: [InboxRow],
  template: `<sp-inbox-row [change]="change()" [now]="now()" />`,
})
class Host {
  readonly change = signal(viewOf(LOGIN));
  readonly now = signal(Date.now());
}

async function render(lang: "es" | "en" = "es") {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return { fixture, element, host: fixture.componentInstance };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("InboxRow", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("says where the change lives and which files it shares, when it knows (AC3)", async () => {
    const { element, fixture, host } = await render();
    expect(element.querySelector("[data-folder]")).toBeNull();
    expect(element.querySelector("[data-shared]")).toBeNull();
    const folder = `/Users/ana/mi-colegio.worktrees/${LOGIN}`;
    const other = { id: "20261019-boletines-pdf", title: "Boletines en PDF" };
    const shared = [
      { path: "lib/auth/session.dart", changes: [other] },
      { path: "lib/app.dart", changes: [other, { id: "x", title: "Modo oscuro" }] },
    ];
    host.change.set({ ...viewOf(LOGIN), folder, shared });
    await fixture.whenStable();
    const place = element.querySelector("[data-folder]");
    expect([text(place), place?.getAttribute("title")]).toEqual([
      `mi-colegio.worktrees/${LOGIN}`,
      folder,
    ]);
    expect(text(element.querySelector("[data-shared]"))).toBe(
      "Comparte lib/auth/session.dart, lib/app.dart con «Boletines en PDF», «Modo oscuro»",
    );
  });

  it("AC1: a change whose tests were sent waits as «Tests por aprobar», with how many", async () => {
    const { element, fixture, host } = await render();
    const tests = {
      submittedAt: new Date().toISOString(),
      files: ["test/login_test.dart", "test/sesion_test.dart"],
      red: [{ cmd: "flutter test", exit: 1 }],
    };
    // Without its size, the line says only what it waits for.
    const { size: _size, ...login } = viewOf(LOGIN);
    host.change.set({ ...login, phase: "testing", decision: "tests", tests });
    await fixture.whenStable();
    expect(text(element.querySelector("[data-waits]"))).toBe("Tests por aprobar · 2 tests nuevos");
    expect(text(element.querySelector("sp-button"))).toBe("Aprobar tests");
  });

  it("AC1: an open change says how long since it started and in its phase, moving with the page clock", async () => {
    const { element, fixture, host } = await render();
    const now = Date.parse("2026-11-05T12:00:00.000Z");
    host.now.set(now);
    host.change.set({
      ...viewOf(LOGIN),
      phase: "implementing",
      createdAt: new Date(now - 135 * 60_000).toISOString(),
      phaseSince: new Date(now - 25 * 60_000).toISOString(),
    });
    await fixture.whenStable();
    expect(text(element.querySelector("[data-started]"))).toBe("Empezó hace 2 h 15 min");
    expect(text(element.querySelector("[data-phase-time]"))).toBe("En esta fase: 25 min");
    expect(element.querySelector("[data-took]")).toBeNull();
    // The times go under the phase.
    expect(element.querySelector("[data-started]")?.hasAttribute("data-since")).toBe(true);
    host.now.set(now + 10 * 60_000);
    await fixture.whenStable();
    expect(text(element.querySelector("[data-started]"))).toBe("Empezó hace 2 h 25 min");
    expect(text(element.querySelector("[data-phase-time]"))).toBe("En esta fase: 35 min");
  });

  it("AC1: a change waiting for a decision also says both times", async () => {
    const { element, fixture, host } = await render();
    const now = Date.parse("2026-11-05T12:00:00.000Z");
    host.now.set(now);
    host.change.set({
      ...viewOf(LOGIN),
      phase: "acceptance",
      decision: "acceptance",
      createdAt: new Date(now - 51 * 3_600_000).toISOString(),
      phaseSince: new Date(now - 5 * 60_000).toISOString(),
    });
    await fixture.whenStable();
    expect(text(element.querySelector("[data-started]"))).toBe("Empezó hace 2 d 3 h");
    expect(text(element.querySelector("[data-phase-time]"))).toBe("En esta fase: 5 min");
  });

  it("AC2: a finished change says the day and time it started and how long it took, not its phase time", async () => {
    const { element, fixture, host } = await render();
    host.now.set(new Date(2026, 10, 5, 9, 0).getTime());
    const started = new Date(2026, 10, 3, 14, 5).getTime();
    const closed = new Date(started + 130 * 60_000).toISOString();
    host.change.set({
      ...viewOf(LOGIN),
      phase: "done",
      createdAt: new Date(started).toISOString(),
      closedAt: closed,
      phaseSince: closed,
    });
    await fixture.whenStable();
    expect(text(element.querySelector("[data-started]"))).toBe("Empezó el 3 nov, 14:05");
    expect(text(element.querySelector("[data-took]"))).toBe("Tardó 2 h 10 min");
    expect(element.querySelector("[data-phase-time]")).toBeNull();
    // A later clock changes nothing: it already ended.
    host.now.set(new Date(2026, 10, 6, 9, 0).getTime());
    await fixture.whenStable();
    expect(text(element.querySelector("[data-took]"))).toBe("Tardó 2 h 10 min");
  });

  it("AC2: a cancelled change from another year says the year it started", async () => {
    const { element, fixture, host } = await render();
    host.now.set(new Date(2026, 0, 10, 9, 0).getTime());
    const started = new Date(2025, 10, 3, 14, 5).getTime();
    const closed = new Date(started + 45 * 60_000).toISOString();
    host.change.set({
      ...viewOf(LOGIN),
      phase: "cancelled",
      createdAt: new Date(started).toISOString(),
      closedAt: closed,
      phaseSince: closed,
    });
    await fixture.whenStable();
    expect(text(element.querySelector("[data-started]"))).toBe("Empezó el 3 nov 2025, 14:05");
    expect(text(element.querySelector("[data-took]"))).toBe("Tardó 45 min");
    expect(element.querySelector("[data-phase-time]")).toBeNull();
  });

  it("AC4: the times read in English too", async () => {
    const { element, fixture, host } = await render("en");
    const now = new Date(2026, 10, 5, 9, 0).getTime();
    host.now.set(now);
    host.change.set({
      ...viewOf(LOGIN),
      phase: "implementing",
      createdAt: new Date(now - 135 * 60_000).toISOString(),
      phaseSince: new Date(now - 25 * 60_000).toISOString(),
    });
    await fixture.whenStable();
    expect(text(element.querySelector("[data-started]"))).toBe("Started 2 h 15 min ago");
    expect(text(element.querySelector("[data-phase-time]"))).toBe("In this phase: 25 min");
    const started = new Date(2026, 10, 3, 14, 5).getTime();
    const closed = new Date(started + 130 * 60_000).toISOString();
    host.change.set({
      ...viewOf(LOGIN),
      phase: "done",
      createdAt: new Date(started).toISOString(),
      closedAt: closed,
      phaseSince: closed,
    });
    await fixture.whenStable();
    expect(text(element.querySelector("[data-started]"))).toBe("Started Nov 3, 2:05 PM");
    expect(text(element.querySelector("[data-took]"))).toBe("Took 2 h 10 min");
  });

  /** Nobody picks up the person's decision: the agent's `specty wait` ran out of time. */
  const unpicked = {
    unattended: {
      since: new Date().toISOString(),
      wait: { tool: "claude-code", ended: "timeout" as const, ago: 12 },
    },
  };

  it("AC5: a change nobody picks up says so, instead of the orphan and away marks", async () => {
    const { element, fixture, host } = await render();
    expect(element.querySelector("[data-unattended]")).toBeNull();
    host.change.set({ ...viewOf(LOGIN), orphan: true, ...unpicked });
    await fixture.whenStable();
    expect(text(element.querySelector("[data-unattended]"))).toBe("Nadie retoma tu decisión");
    expect(element.querySelector("[data-unheld]")).toBeNull();
    host.change.set({ ...viewOf(LOGIN), away: { tool: "codex", ago: 4 }, ...unpicked });
    await fixture.whenStable();
    expect(text(element.querySelector("[data-unattended]"))).toBe("Nadie retoma tu decisión");
    expect(element.querySelector("[data-unheld]")).toBeNull();
  });

  it("AC5, AC6: the mark reads in English too", async () => {
    const { element, fixture, host } = await render("en");
    host.change.set({ ...viewOf(LOGIN), ...unpicked });
    await fixture.whenStable();
    expect(text(element.querySelector("[data-unattended]"))).toBe("Nobody picks up your decision");
  });
});
