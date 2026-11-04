// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import type { MemoryEntry } from "@baquia-dev/specty-core";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type ChangeRecord, type MemoryRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
};

const reminder = (id: string, extra: Partial<MemoryEntry>): MemoryEntry => ({
  id,
  kind: "reminder",
  status: "open",
  created: "2026-11-01T10:00:00.000Z",
  origin: { by: "claude-code" },
  text: `Texto de ${id}`,
  ...extra,
});

/** P1 waits for a day far ahead, P2 for a change, P3 for the files of `src/`; P4's day came. */
@Injectable()
class Reminders extends FixtureData {
  override memory(): Promise<MemoryRecord> {
    return Promise.resolve({
      entries: [
        reminder("P1", { due: "2099-01-01" }),
        reminder("P2", { onClose: "20261104-x" }),
        reminder("P3", { paths: ["src/**"] }),
        reminder("P4", { due: "2020-01-01" }),
      ],
      changes: [],
    });
  }
}

async function open() {
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
      { provide: SpectyData, useClass: Reminders },
      IN_THREAD,
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  const element: HTMLElement = fixture.nativeElement;
  await TestBed.inject(Router).navigateByUrl("/memory");
  for (let round = 0; round < 40; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  const page = () => element.querySelector<HTMLElement>("sp-memory-page");
  const section = (key: string) => page()?.querySelector<HTMLElement>(`[data-section="${key}"]`);
  const row = (key: string, id: string) =>
    section(key)?.querySelector<HTMLElement>(`[data-entry="${id}"]`);
  return { section, row };
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("the reminders on the memory page", () => {
  it("AC1: shows the ones that wait in their own section, not in «Te toca»", async () => {
    const { section, row } = await open();
    expect(text(section("waiting"))).toContain("Recordatorios que esperan");
    for (const id of ["P1", "P2", "P3"]) {
      expect(row("waiting", id), id).toBeTruthy();
      expect(row("turn", id), id).toBeFalsy();
    }
    expect(row("turn", "P4")).toBeTruthy();
  });

  it("AC3: says under each one what it waits or waited for", async () => {
    const { row } = await open();
    expect(text(row("waiting", "P1"))).toContain("desde 2099-01-01");
    expect(text(row("waiting", "P2"))).toContain("al cerrar 20261104-x");
    expect(text(row("waiting", "P3"))).toContain("en src/**");
    expect(text(row("turn", "P4"))).toContain("desde 2020-01-01");
  });
});
