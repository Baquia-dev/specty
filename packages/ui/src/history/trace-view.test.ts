// SPDX-License-Identifier: Apache-2.0
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import type { WhyCommit } from "@baquia-dev/specty-core";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { ActionError, type ChangeRecord } from "../data/records";
import { SpectyData } from "../data/source";
import type { TraceRecord } from "../data/trace";
import { deriveViews } from "../data/views";
import { TraceView } from "./trace-view";

const ID = "20261018-asistencia-curso";

const OUTSIDE: WhyCommit = {
  commit: "5d2a7b0",
  date: "2026-10-01",
  author: "Ana Gómez",
  subject: "Primera versión del registro de asistencia",
};

const TRACED: WhyCommit = {
  commit: "8b0a4f6",
  date: "2026-10-18",
  author: "Agente",
  subject: "feat(attendance): Panel con estudiantes destacados",
  change: {
    id: ID,
    title: "Panel de asistencia por curso",
    task: { id: "T2", title: "Panel con estudiantes destacados" },
    criteria: [
      {
        id: "AC1",
        text: "CUANDO el coordinador abre el panel ENTONCES ve el porcentaje semanal por curso.",
      },
      {
        id: "AC2",
        text: "CUANDO un estudiante supera tres ausencias en la semana ENTONCES aparece destacado.",
      },
    ],
  },
};

const FIRST: TraceRecord = {
  path: "lib/attendance/attendance_repository.dart",
  commit: "8b0a4f6",
  lines: ["import 'attendance_record.dart';", "", "class CoursePanel {}"],
  blocks: [
    { start: 1, end: 2, commit: OUTSIDE },
    { start: 3, end: 3, commit: TRACED },
  ],
};

const SECOND: TraceRecord = {
  path: "lib/attendance/course_panel.dart",
  commit: "8b0a4f6",
  lines: ["void main() {}"],
  blocks: [{ start: 1, end: 1, commit: TRACED }],
};

/** A source with two traced files, or none, or one that fails to list them. */
class Source extends SpectyData {
  files: readonly string[] = [FIRST.path, SECOND.path];
  failure: ActionError | undefined;

  override changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([]);
  }

  override subscribe(): () => void {
    return () => undefined;
  }

  override traceFiles(_change: string): Promise<readonly string[]> {
    return this.failure === undefined ? Promise.resolve(this.files) : Promise.reject(this.failure);
  }

  override trace(_change: string, path: string): Promise<TraceRecord> {
    const found = [FIRST, SECOND].find((trace) => trace.path === path);
    return found === undefined
      ? Promise.reject(new ActionError({ es: "No es del cambio.", en: "Not the change's." }))
      : Promise.resolve(found);
  }
}

/** A source that gives no traceability at all. */
class Bare extends SpectyData {
  override changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([]);
  }

  override subscribe(): () => void {
    return () => undefined;
  }
}

@Component({
  imports: [TraceView],
  template: `<sp-trace-view [change]="id" />`,
})
class Host {
  readonly id = ID;
}

function quiet(): void {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", "es");
}

const text = (node: Element | null | undefined) =>
  node?.textContent?.replace(/\s+/g, " ").trim() ?? "";

async function render(source: SpectyData) {
  quiet();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: SpectyData, useValue: source }],
  });
  const fixture = TestBed.createComponent(Host);
  const settle = async () => {
    for (let round = 0; round < 10; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  return { element, settle };
}

describe("the traceability view", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: shows the first file's lines with a blame margin: the commit, change, task and criteria of each block", async () => {
    const { element } = await render(new Source());
    const lines = [...element.querySelectorAll("[data-line]")];
    expect(lines).toHaveLength(3);
    expect(text(lines[0])).toContain("import 'attendance_record.dart';");
    expect(text(lines[2])).toContain("3");
    expect(text(lines[2])).toContain("class CoursePanel {}");

    const blocks = [...element.querySelectorAll("[data-block]")];
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.querySelectorAll("[data-line]")).toHaveLength(2);
    const outside = text(blocks[0]?.querySelector("[data-blame]"));
    for (const part of ["5d2a7b0", "Primera versión del registro de asistencia", "Ana Gómez"]) {
      expect(outside).toContain(part);
    }
    expect(outside).toContain("2026-10-01");

    const traced = blocks[1]?.querySelector("[data-blame]");
    for (const part of ["8b0a4f6", "T2", "Panel con estudiantes destacados", "AC1", "AC2"]) {
      expect(text(traced)).toContain(part);
    }
    expect(traced?.querySelector(`a[href="/changes/${ID}?tab=history"]`)).not.toBeNull();

    const taskRef = traced?.querySelector<HTMLElement>("[data-item-ref=T2]");
    taskRef?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    await settle();
    expect(document.querySelector(".cdk-overlay-container [data-tooltip]")?.textContent?.trim()).toBe(
      "Tarea T2: Panel con estudiantes destacados",
    );

    const criterionBadge = traced?.querySelector<HTMLElement>("sp-badge");
    criterionBadge?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    await settle();
    expect(document.querySelector(".cdk-overlay-container [data-tooltip]")?.textContent?.trim()).toBe(
      "Criterio de aceptación AC1: CUANDO el coordinador abre el panel ENTONCES ve el porcentaje semanal por curso.",
    );
  });

  it("AC1: shows another file when the person chooses it", async () => {
    const { element, settle } = await render(new Source());
    element.querySelector<HTMLElement>("[role=combobox]")?.click();
    await settle();
    const options = [...document.querySelectorAll<HTMLElement>("[role=option]")];
    expect(options.map((option) => text(option))).toEqual([FIRST.path, SECOND.path]);
    options[1]?.click();
    await settle();
    const lines = element.querySelectorAll("[data-line]");
    expect(lines).toHaveLength(1);
    expect(text(lines[0])).toContain("void main() {}");
  });

  it("AC2: says why when there is nothing to trace or the source cannot trace", async () => {
    const failing = new Source();
    failing.failure = new ActionError({
      es: "Este cambio aún no tiene commits.",
      en: "This change has no commits yet.",
    });
    const refused = await render(failing);
    expect(text(refused.element.querySelector("[data-trace-message]"))).toContain(
      "Este cambio aún no tiene commits.",
    );
    expect(refused.element.querySelectorAll("[data-line]")).toHaveLength(0);

    const bare = await render(new Bare());
    expect(text(bare.element.querySelector("[data-trace-message]"))).toContain(
      "Esta fuente no da la trazabilidad.",
    );

    const empty = new Source();
    empty.files = [];
    const none = await render(empty);
    expect(text(none.element.querySelector("[data-trace-message]"))).toContain("no dejó archivos");
  });

  it("AC1: is the «Trazabilidad» view of a change's History tab", async () => {
    quiet();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(APP_ROUTES, withComponentInputBinding()),
        { provide: SpectyData, useClass: FixtureData },
        {
          provide: DERIVER,
          useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
        },
      ],
    });
    const fixture = TestBed.createComponent(Shell);
    const settle = async () => {
      for (let round = 0; round < 40; round++) {
        await fixture.whenStable();
        await new Promise((resolve) => setTimeout(resolve));
      }
    };
    await TestBed.inject(Router).navigateByUrl(`/changes/${ID}?tab=history`);
    await settle();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector("sp-trace-view")).toBeNull();
    element
      .querySelector<HTMLInputElement>("sp-history-tab input[type=radio][value=trace]")
      ?.click();
    await settle();
    expect(element.querySelectorAll("sp-trace-view [data-line]").length).toBeGreaterThan(0);
    expect(element.querySelector("sp-history-tab [data-event]")).toBeNull();

    element
      .querySelector<HTMLInputElement>("sp-history-tab input[type=radio][value=timeline]")
      ?.click();
    await settle();
    expect(element.querySelector("sp-trace-view")).toBeNull();
    expect(element.querySelectorAll("sp-history-tab [data-event]").length).toBeGreaterThan(0);
  });
});
