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
  template: `<sp-inbox-row [change]="change()" />`,
})
class Host {
  readonly change = signal(viewOf(LOGIN));
}

async function render() {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", "es");
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

  it("AC2: shows time in current phase and total execution time for in-progress changes", async () => {
    const { element, fixture, host } = await render();
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    const change = {
      ...viewOf(LOGIN),
      phase: "implementing" as const,
      phaseSince: new Date(now - 15 * 60_000).toISOString(),
      createdAt: new Date(now - 75 * 60_000).toISOString(),
    };
    host.change.set(change as unknown as ChangeView);
    await fixture.whenStable();
    expect(text(element.querySelector("[data-phase-time]"))).toBe("Fase: 15 min");
    expect(text(element.querySelector("[data-total-time]"))).toBe("Total: 1 h 15 min");
  });

  it("AC3: shows total time for finished changes", async () => {
    const { element, fixture, host } = await render();
    const created = "2026-10-20T10:00:00.000Z";
    const closed = "2026-10-20T10:45:00.000Z";
    const change = {
      ...viewOf(LOGIN),
      phase: "done" as const,
      createdAt: created,
      closedAt: closed,
      phaseSince: closed,
    };
    host.change.set(change as unknown as ChangeView);
    await fixture.whenStable();
    expect(element.querySelector("[data-phase-time]")).toBeNull();
    expect(text(element.querySelector("[data-total-time]"))).toBe("Total: 45 min");
  });
});
