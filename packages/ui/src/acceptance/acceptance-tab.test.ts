// SPDX-License-Identifier: Apache-2.0
import { Component, Injectable, input } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FixtureData, sampleRecords } from "../data/fixtures";
import { type Bilingual, type ChangeView, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";
import { HIGHLIGHT } from "../highlight/highlight";
import { AcceptanceTab } from "./acceptance-tab";

const VIEWS = deriveViews(sampleRecords(Date.now()));
const KEY = "specty.acceptance.view";

function view(id: string): ChangeView {
  const found = VIEWS.find((item) => item.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
}

const ASISTENCIA = view("20261018-asistencia-curso");

@Component({
  imports: [AcceptanceTab],
  template: `<sp-acceptance-tab [change]="change()" />`,
})
class Host {
  readonly change = input.required<ChangeView>();
}

/** The sample data on a server the agent started: nobody decides here. */
@Injectable()
class ReadOnly extends FixtureData {
  override readOnly(): Promise<Bilingual | undefined> {
    return Promise.resolve({ es: "Solo lectura.", en: "Read only." });
  }
}

async function render(change: ChangeView = ASISTENCIA, source: typeof FixtureData = FixtureData) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SpectyData, useClass: source },
      // Plain code in the Changes view: the colors are tested with the viewer.
      { provide: HIGHLIGHT, useValue: () => Promise.resolve(undefined) },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentRef.setInput("change", change);
  await fixture.whenStable();
  // The source says once whether the person may decide here.
  await new Promise((done) => setTimeout(done));
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const row = (id: string) => element.querySelector<HTMLElement>(`[data-criterion=${id}]`);
  const settle = () => fixture.whenStable();
  return { fixture, element, row, settle };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const texts = (elements: Iterable<Element>) => [...elements].map(text);

/** Picks a view in the «Vista» select, as the person would. */
async function chooseView(element: HTMLElement, settle: () => Promise<void>, label: string) {
  element.querySelector<HTMLElement>("[data-view] [data-select]")?.click();
  await settle();
  [...document.querySelectorAll<HTMLElement>("[role=option]")]
    .find((option) => text(option) === label)
    ?.click();
  await settle();
}

describe("Acceptance tab", () => {
  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it("shows each criterion with the tasks that back it, under a summary (AC1)", async () => {
    const { element, row } = await render();
    expect(text(element.querySelector("[data-summary]"))).toBe(
      "2 de 2 criterios verificados · 2 tareas hechas · 2 commits",
    );
    const criteria = element.querySelector("[aria-labelledby=acceptance-criteria]");
    expect(text(criteria?.querySelector("sp-section-divider [data-meta]"))).toBe("2 de 2");
    const rows = [...element.querySelectorAll<HTMLElement>("sp-criterion-row")];
    expect(rows.map((item) => [item.dataset.criterion, item.getAttribute("role")])).toEqual([
      ["AC1", "listitem"],
      ["AC2", "listitem"],
    ]);
    expect(text(row("AC1")?.querySelector("p"))).toBe(
      "CUANDO el coordinador abre el panel ENTONCES ve el porcentaje semanal por curso.",
    );
    expect(texts(row("AC1")?.querySelectorAll("[data-evidence] li") ?? [])).toEqual([
      "T1 Agregados semanales commit 3c9d1e2 Verificación correcta · 12 s Ver diff de T1",
      "T2 Panel con estudiantes destacados commit 8b0a4f6 Verificación correcta · 21 s Ver diff de T2",
    ]);
    expect(row("AC1")?.querySelector<HTMLElement>("[data-verdict]")?.style.color).toBe(
      "var(--color-phase-done)",
    );
    expect(text(row("AC2")?.querySelector("[data-mark]"))).toBe("Verificado");
    expect(text(row("AC2")?.querySelector("[data-not-met]"))).toBe("No se cumple AC2…");
  });

  it("tells what is missing outside acceptance, with no actions (AC1)", async () => {
    const pdf = await render(view("20261019-boletines-pdf"));
    expect(text(pdf.element.querySelector("[data-summary]"))).toBe(
      "0 de 1 criterios verificados · 2 tareas hechas · 2 commits",
    );
    expect(text(pdf.row("AC1")?.querySelector("[data-mark]"))).toBe("Pendiente");
    expect(text(pdf.row("AC1")?.querySelector("[data-task=T3] [data-verdict]"))).toBe("En curso");
    expect(pdf.element.querySelector("[data-not-met]")).toBeNull();
    expect(pdf.element.querySelector("sp-closing-view")).toBeNull();

    const reminders = view("20261017-recordatorios-correo");
    const sent = await render(reminders);
    expect(text(sent.row("AC1")?.querySelector("[data-mark]"))).toBe("Hecho, sin verificación");
    expect(text(sent.row("AC1")?.querySelector("[data-verdict]"))).toBe("Sin verificación");
    expect(text(sent.element.querySelector("[data-summary]"))).toBe(
      "0 de 1 criterios verificados · 1 tarea hecha · 0 commits",
    );
    // The closing the agent sent, under the summary and above the full verification (AC1).
    const sections = [...sent.element.querySelectorAll("section[aria-labelledby]")];
    expect(sections.map((section) => section.getAttribute("aria-labelledby"))).toEqual([
      "acceptance-closing",
      "full-verification",
      "acceptance-criteria",
    ]);
    expect(sent.element.querySelectorAll("sp-closing-view [data-part]")).toHaveLength(4);
    // Accepted, with the closing not sent yet: the agent is writing it (AC2).
    const { decision, ...accepted } = reminders;
    expect(decision).toBe("closing");
    const writing = await render(accepted);
    expect(text(writing.element.querySelector("[data-writing]"))).toContain(
      "El agente redacta el cierre",
    );
    // Done: the closing stays to read; a quick change, with none, shows no section.
    const done = await render({ ...accepted, phase: "done" });
    expect(text(done.element.querySelector("sp-closing-view [data-meta]"))).toBe("confirmado");
    const { closing: _none, ...quick } = accepted;
    expect(
      (await render({ ...quick, phase: "done" })).element.querySelector("sp-closing-view"),
    ).toBeNull();
  });

  it("marks a criterion no task covers", async () => {
    const criteria = [
      ...ASISTENCIA.review.criteria,
      { id: "AC3", text: "CUANDO cambia la semana ENTONCES el panel la muestra.", warnings: [] },
    ];
    const { row } = await render({ ...ASISTENCIA, review: { ...ASISTENCIA.review, criteria } });
    expect(text(row("AC3")?.querySelector("[data-mark]"))).toBe("Sin tarea");
    expect(row("AC3")?.querySelector("[data-evidence]")).toBeNull();
  });

  it("switches to the matrix, shows the task of a cell and remembers the view (AC2)", async () => {
    const { element, settle } = await render();
    element.querySelector<HTMLElement>("[data-view] [data-select]")?.click();
    await settle();
    [...document.querySelectorAll<HTMLElement>("[role=option]")]
      .find((option) => text(option) === "Matriz")
      ?.click();
    await settle();
    expect(localStorage.getItem(KEY)).toBe("matrix");
    expect(element.querySelector("sp-criterion-row")).toBeNull();
    const table = element.querySelector("[data-matrix] table");
    expect(texts(table?.querySelectorAll("thead th") ?? [])).toEqual([
      "Criterio",
      "T1 Agregados semanales",
      "T2 Panel con estudiantes destacados",
    ]);
    expect(texts(table?.querySelectorAll("tbody th") ?? [])).toEqual([
      "AC1 CUANDO el coordinador abre el panel ENTONCES ve el porcentaje semanal por curso.",
      "AC2 CUANDO un estudiante supera tres ausencias en la semana ENTONCES aparece destacado.",
    ]);
    // The dash is only drawn; a screen reader hears the sentence.
    expect(text(table?.querySelectorAll("tbody tr")[1]?.querySelectorAll("td")[0])).toBe(
      "—T1 no cubre AC2",
    );
    expect(texts(table?.querySelectorAll("tfoot td") ?? [])).toEqual([
      "Verificación correcta · 12 s",
      "Verificación correcta · 21 s",
    ]);
    const cell = (id: string) => element.querySelector<HTMLButtonElement>(`[data-cell=${id}]`);
    expect(cell("AC1-T1")?.getAttribute("aria-pressed")).toBe("true");
    expect(cell("AC2-T2")?.getAttribute("aria-label")).toBe(
      "AC2 cubierto por T2, commit 8b0a4f6, Verificación correcta · 21 s",
    );
    cell("AC2-T2")?.click();
    await settle();
    expect(cell("AC2-T2")?.getAttribute("aria-pressed")).toBe("true");
    expect(cell("AC1-T1")?.getAttribute("aria-pressed")).toBe("false");
    expect(texts(element.querySelector("[data-detail]")?.children ?? [])).toEqual([
      "AC2 · cubierto por T2",
      "Panel con estudiantes destacados",
      "Panel por curso con los estudiantes de más de tres ausencias resaltados.",
      "commit 8b0a4f6 Ver diff de T2 lib/attendance/course_panel.dart 2 intentos",
      "Verificación correcta · 21 s flutter test test/attendance",
    ]);

    // Back later, the matrix is still there; a task with no commit shows how far it got.
    const again = await render(view("20261019-boletines-pdf"));
    expect(text(again.element.querySelector("[data-cell=AC1-T3]"))).toBe("En curso");
  });

  it("shows the diff of the change in the Changes view, and remembers it (AC1)", async () => {
    const { element, settle } = await render();
    await chooseView(element, settle, "Cambios");
    expect(localStorage.getItem(KEY)).toBe("changes");
    expect(element.querySelector("[aria-labelledby=acceptance-criteria]")).toBeNull();
    expect(text(element.querySelector("#acceptance-changes"))).toBe("Cambios");
    expect(text(element.querySelector("sp-diff-viewer [data-summary]"))).toContain(
      "5d2a7b0 → 8b0a4f6 · 4 archivos",
    );
    // Back later, it opens there.
    const again = await render();
    expect(again.element.querySelector("sp-changes-view")).not.toBeNull();
  });

  it("takes «Ver diff» from a criterion or the matrix to that task's diff (AC3)", async () => {
    const { element, row, settle } = await render();
    const shown = () => text(element.querySelector("sp-diff-viewer [data-summary]"));
    row("AC1")?.querySelector<HTMLElement>("[data-task=T1] [data-show-diff]")?.click();
    await settle();
    expect(shown()).toContain("5d2a7b0 → 3c9d1e2 · 2 archivos");
    expect(element.querySelector<HTMLInputElement>('[data-scope] input[value="T1"]')?.checked).toBe(
      true,
    );
    expect(document.activeElement?.id).toBe("acceptance-changes");
    // From the matrix: the detail of the cell picked.
    await chooseView(element, settle, "Matriz");
    element.querySelector<HTMLElement>("[data-cell=AC2-T2]")?.click();
    await settle();
    element.querySelector<HTMLElement>("[data-detail] [data-show-diff]")?.click();
    await settle();
    expect(shown()).toContain("3c9d1e2 → 8b0a4f6 · 2 archivos");
    expect(document.activeElement?.id).toBe("acceptance-changes");
  });

  it("falls back to the list when the browser keeps nothing", async () => {
    const { getItem, setItem } = Storage.prototype;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      if (key === KEY) throw new Error("blocked");
      return getItem.call(this, key);
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === KEY) throw new Error("blocked");
      setItem.call(this, key, value);
    });
    const { element } = await render();
    expect(element.querySelectorAll("sp-criterion-row")).toHaveLength(2);
  });

  it("asks for adjustments about a criterion that is not met (AC3)", async () => {
    const { row, settle } = await render();
    row("AC2")?.querySelector<HTMLButtonElement>("[data-not-met]")?.click();
    await settle();
    const dialog = document.querySelector("[role=dialog]");
    expect(text(dialog?.querySelector("h2"))).toBe("Pedir ajustes");
    expect(dialog?.querySelector("textarea")?.value).toBe("AC2: ");
  });

  it("offers no «No se cumple…» on a read-only server (AC1)", async () => {
    const { element } = await render(ASISTENCIA, ReadOnly);
    expect(element.querySelector("[data-not-met]")).toBeNull();
  });

  it("says so when the spec has no criteria yet", async () => {
    const { element } = await render({
      ...ASISTENCIA,
      review: { ...ASISTENCIA.review, criteria: [] },
    });
    expect(text(element.querySelector("sp-empty-state h2"))).toBe("Aún no hay criterios");
    expect(element.querySelector("[data-view]")).toBeNull();
  });
});
