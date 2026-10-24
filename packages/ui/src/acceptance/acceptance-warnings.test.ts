// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { WarningView } from "../data/records";
import { Preferences } from "../theme/preferences";
import { AcceptanceWarnings } from "./acceptance-warnings";

const WARNINGS: readonly WarningView[] = [
  {
    task: "T1",
    kind: "risk",
    path: "lib/attendance/attendance_repository.dart",
    line: 12,
    cwe: "CWE-798",
    text: { es: "parece un secreto en el código", en: "looks like a secret in the code" },
  },
  {
    task: "T2",
    kind: "assertions",
    path: "test/attendance/course_panel_test.dart",
    text: {
      es: "quitó 1 aserción de un test que ya existía",
      en: "removed 1 assertion from a test that already existed",
    },
  },
];

@Component({
  imports: [AcceptanceWarnings],
  template: `<sp-acceptance-warnings [warnings]="warnings()" />`,
})
class Host {
  readonly warnings = signal(WARNINGS);
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("AcceptanceWarnings", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("lists each warning with its task, file and line, what was found and its CWE (AC2)", async () => {
    window.matchMedia = (() => ({
      matches: false,
      addEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    localStorage.setItem("specty.lang", "es");
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(text(element.querySelector("h2"))).toContain("Avisos");
    expect(text(element.querySelector("[data-warnings] > p"))).toContain(
      "Son patrones conocidos, no fallos seguros",
    );
    const rows = [...element.querySelectorAll("li")];
    expect(
      rows.map((row) => [text(row.querySelector("span")), text(row.querySelector("p"))]),
    ).toEqual([
      [
        "T1",
        "lib/attendance/attendance_repository.dart:12 parece un secreto en el código (CWE-798)",
      ],
      ["T2", "test/attendance/course_panel_test.dart quitó 1 aserción de un test que ya existía"],
    ]);
    expect(rows.map((row) => row.getAttribute("data-kind"))).toEqual(["risk", "assertions"]);
    TestBed.inject(Preferences).lang.set("en");
    await fixture.whenStable();
    expect(text(rows[0])).toContain("looks like a secret in the code (CWE-798)");
  });
});
