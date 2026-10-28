// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { LockedTestView } from "../data/locks";
import { LockedTests } from "./locked-tests";

const LOCKED: readonly LockedTestView[] = [
  { path: "test/login_test.dart", unlocks: [{ request: "S1", task: "T1" }] },
  {
    path: "test/sesion_test.dart",
    unlockedFor: "T2",
    unlocks: [
      { request: "S1", task: "T1" },
      { request: "S3", task: "T2" },
    ],
  },
  { path: "test/aviso_test.dart", unlocks: [] },
];

@Component({
  imports: [LockedTests],
  template: `<sp-locked-tests [tests]="tests()" />`,
})
class Host {
  readonly tests = signal(LOCKED);
}

async function render(lang = "es") {
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return { element };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("LockedTests", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: lists each locked test by its path, the one unlocked for the task in progress and the unlocks so far", async () => {
    const { element } = await render();
    expect(text(element.querySelector("h2"))).toBe("Tests bloqueados");
    expect(text(element.querySelector("[data-meta]"))).toBe("3");
    const rows = [...element.querySelectorAll("[data-locked]")];
    expect(rows.map((row) => text(row.querySelector("code")))).toEqual([
      "test/login_test.dart",
      "test/sesion_test.dart",
      "test/aviso_test.dart",
    ]);
    expect(rows.map((row) => text(row.querySelector("[data-state]")))).toEqual([
      "Bloqueado · se desbloqueó con S1 para T1",
      "Desbloqueado para T2: vuelve a bloquearse al terminarla · se desbloqueó con S1 para T1 y con S3 para T2",
      "Bloqueado",
    ]);
    expect(rows.map((row) => row.hasAttribute("data-open"))).toEqual([false, true, false]);
  });

  it("says it in English", async () => {
    const { element } = await render("en");
    expect(text(element.querySelector("h2"))).toBe("Locked tests");
    expect(text(element.querySelectorAll("[data-state]")[1])).toBe(
      "Unlocked for T2: it locks again once that task is done · unlocked with S1 for T1 and with S3 for T2",
    );
  });
});
