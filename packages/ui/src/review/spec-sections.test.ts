// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { type ChangeState, type Phase, parseSpec } from "@baquia-dev/specty-core";
import { Toasts } from "../components/toast";
import {
  type AssumptionView,
  type ChangeRecord,
  type CommentAnchor,
  SpectyData,
} from "../data/records";
import { deriveReview } from "../data/review";
import { deriveViews } from "../data/views";
import { AssumptionRow } from "./assumption-row";
import { SECTION_LABELS } from "./comments";
import { SECTION_META } from "./section-meta";
import { ReviewItems } from "./spec-sections";

const SPEC = `# Entrar con Google

## Objetivo

Entrar con Google.

## Criterios de aceptación

- AC1: CUANDO alguien pulsa "Entrar" ENTONCES entra.
- AC2: La pantalla responde rápido.

## Archivos

- crear lib/auth/google.dart — proveedor
- renombrar lib/login/old.dart -> lib/login/screen.dart — nombre claro

## Tareas

- [ ] T1: Proveedor
  - files: lib/auth/google.dart
  - ac: AC1, AC2

## Riesgos

- R1: Google cambia su API.
`;

const STATE: ChangeState = {
  schema: 1,
  id: "20261021-login-google",
  kind: "standard",
  phase: "review",
  revision: 1,
  items: {},
  tasks: { T1: { status: "active", attempts: 1, scopeExtra: [] } },
  pending: { scopeRequests: [], adjustment: null },
  maxIds: {},
};

const REVIEW = deriveReview(parseSpec(SPEC).spec, STATE, []);

class Recording extends SpectyData {
  readonly calls: unknown[][] = [];
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([]);
  }
  subscribe(): () => void {
    return () => undefined;
  }
  override decideAssumption(...args: unknown[]): Promise<void> {
    this.calls.push(args);
    return args[1] === "A9" ? Promise.reject(new Error("boom")) : Promise.resolve();
  }
}

@Component({
  imports: [AssumptionRow, ReviewItems],
  template: `
    <div role="list">
      <sp-assumption-row change="20261021-login-google" [assumption]="assumption()" [comments]="comments()" [editable]="editable()" (comment)="anchors.push($event)" />
    </div>
    @for (section of sections; track section) {
      <sp-review-items [attr.id]="section" [review]="review" [section]="section" [editable]="editable()" (comment)="anchors.push($event)" />
    }
  `,
})
class Host {
  readonly assumption = signal<AssumptionView>({
    id: "A1",
    text: "Existe el proyecto.",
    impact: "high",
    decision: "pending",
  });
  readonly comments = signal<readonly import("../data/records").CommentView[]>([]);
  readonly editable = signal(true);
  readonly review = REVIEW;
  readonly sections = ["criteria", "files", "tasks", "risks"] as const;
  readonly anchors: CommentAnchor[] = [];
}

async function render() {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  const source = new Recording();
  TestBed.configureTestingModule({ providers: [{ provide: SpectyData, useValue: source }] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  };
  return { fixture, element, source, settle, host: fixture.componentInstance };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("AssumptionRow", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("is a document row with impact and decision, tinted while it blocks approval (AC1)", async () => {
    const { element, source, fixture, host } = await render();
    const card = element.querySelector<HTMLElement>("sp-assumption-row");
    expect(card?.getAttribute("role")).toBe("listitem");
    // No lines between rows: the one under the pointer or with focus inside lights up instead.
    expect(card?.className).not.toMatch(/\bborder-[bt]\b/);
    expect(card?.className.split(" ")).toEqual(
      expect.arrayContaining(["hover:bg-text/4", "focus-within:bg-text/4"]),
    );
    expect(text(card?.querySelector(".font-mono"))).toBe("A1");
    expect(text(card)).toContain("Alto impacto");
    expect(text(card?.querySelector("[data-decision]"))).toBe("Por decidir");
    expect(card?.querySelector("[data-decision] svg")).not.toBeNull();
    expect(card?.hasAttribute("data-waiting")).toBe(true);
    expect(card?.style.background).toContain("var(--color-phase-review-bg)");
    card?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    expect(source.calls).toEqual([["20261021-login-google", "A1", "confirmed"]]);

    host.assumption.set({
      id: "A1",
      text: "Existe el proyecto.",
      impact: "high",
      decision: "confirmed",
    });
    await fixture.whenStable();
    expect(card?.hasAttribute("data-waiting")).toBe(false);
    expect(card?.style.background).toBe("");
    expect(text(card?.querySelector("[data-decision]"))).toBe("Confirmado");
  });

  it("confirms in review (AC2)", async () => {
    const { element, source } = await render();
    const card = element.querySelector("sp-assumption-row");
    card?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    expect(source.calls).toEqual([["20261021-login-google", "A1", "confirmed"]]);
  });

  it("offers «Cambiar decisión» once decided, which brings the choices back (AC2)", async () => {
    const { element, source, settle, host, fixture } = await render();
    const card = () => element.querySelector("sp-assumption-row");
    const buttons = () => [...(card()?.querySelectorAll("sp-button button") ?? [])].map(text);
    const decided = { id: "A1", text: "Existe el proyecto.", impact: "high" } as const;
    host.assumption.set({ ...decided, decision: "confirmed" });
    await fixture.whenStable();
    expect(buttons()).toEqual(["Cambiar decisión"]);
    expect(card()?.hasAttribute("data-waiting")).toBe(false);

    card()?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    await settle();
    expect(buttons()).toEqual(["Confirmar", "Rechazar…"]);
    // The pressed button is gone: focus moves to the first choice.
    expect(document.activeElement).toBe(card()?.querySelector("[data-choices] button"));

    // A live update with the same decision leaves the choices open…
    host.assumption.set({ ...decided, decision: "confirmed" });
    await fixture.whenStable();
    expect(buttons()).toEqual(["Confirmar", "Rechazar…"]);
    card()?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    expect(source.calls).toEqual([["20261021-login-google", "A1", "confirmed"]]);
    // …and a new decision folds them away.
    host.assumption.set({ ...decided, decision: "rejected", comment: "No existe." });
    await fixture.whenStable();
    expect(buttons()).toEqual(["Cambiar decisión"]);
  });

  it("rejects only with a reason, which stays next to it (AC2)", async () => {
    const { element, source, settle, host, fixture } = await render();
    [
      ...element.querySelectorAll<HTMLButtonElement>("sp-assumption-row sp-button button"),
    ][1]?.click();
    await settle();
    const buttons = () => [
      ...document.querySelectorAll<HTMLButtonElement>("[role=dialog] sp-button button"),
    ];
    expect(buttons().at(-1)?.disabled).toBe(true);
    const field = document.querySelector<HTMLTextAreaElement>("[role=dialog] textarea");
    if (field === null) throw new Error("no field");
    field.value = "Son periodos del colegio.";
    field.dispatchEvent(new Event("input"));
    await settle();
    buttons().at(-1)?.click();
    await settle();
    expect(source.calls).toEqual([
      ["20261021-login-google", "A1", "rejected", "Son periodos del colegio."],
    ]);
    expect(document.querySelector("[role=dialog]")).toBeNull();

    host.assumption.set({
      id: "A1",
      text: "Existe el proyecto.",
      decision: "rejected",
      comment: "Son periodos del colegio.",
    });
    host.editable.set(false);
    await fixture.whenStable();
    expect(text(element.querySelector("sp-assumption-row"))).toContain(
      "Motivo: «Son periodos del colegio.»",
    );
    expect(element.querySelector("sp-assumption-row sp-button")).toBeNull();
  });

  it("AC4: disables assumption actions when assumption has pending comments", async () => {
    const { element, fixture, host } = await render();
    host.comments.set([
      {
        id: "c1",
        revision: 1,
        anchor: { item: "A1" },
        author: "User",
        body: "Duda sobre A1",
        createdAt: new Date().toISOString(),
        resolved: false,
        section: "assumptions",
      },
    ]);
    await fixture.whenStable();
    const buttons = element.querySelectorAll<HTMLButtonElement>(
      "sp-assumption-row sp-button button",
    );
    expect(buttons[0]?.disabled).toBe(true);
    expect(buttons[1]?.disabled).toBe(true);
  });

  it("emits a comment anchored to the item (AC6)", async () => {
    const { element, host } = await render();
    element.querySelector<HTMLButtonElement>("sp-assumption-row sp-icon-button button")?.click();
    expect(host.anchors).toEqual([{ item: "A1" }]);
  });

  it("AC2: shows loading state on confirm button while decideAssumption is running", async () => {
    let resolveAction!: () => void;
    const pendingPromise = new Promise<void>((res) => {
      resolveAction = res;
    });
    const { element, fixture, source } = await render();
    (source as Recording).decideAssumption = () => pendingPromise;
    const confirmButton = element.querySelector<HTMLButtonElement>(
      "sp-assumption-row sp-button[variant=primary] button",
    );
    confirmButton?.click();
    await fixture.whenStable();
    expect(confirmButton?.getAttribute("aria-busy")).toBe("true");
    expect(confirmButton?.disabled).toBe(true);
    expect(confirmButton?.querySelector(".animate-spin")).not.toBeNull();
    resolveAction();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(confirmButton?.getAttribute("aria-busy")).toBeNull();
  });
});

describe("ReviewItems", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("puts criterion warnings inline, with icon and text, in id-first rows (AC1, AC3)", async () => {
    const { element } = await render();
    const vague = element.querySelector("#criteria [data-item=AC2]");
    expect(text(vague?.querySelector(".font-mono"))).toBe("AC2");
    // Indented under the section, with no line between, above or below the rows.
    const list = element.querySelector("#criteria ol")?.className ?? "";
    expect(list.split(" ")).toContain("pl-6");
    const rows = [...element.querySelectorAll("#criteria li, #files li, #tasks li, #risks li")];
    expect(rows.length).toBeGreaterThan(0);
    for (const line of [list, ...rows.map((row) => row.className)]) {
      expect(line).not.toMatch(/\bborder-[bt]\b/);
    }
    expect(vague?.className.split(" ")).toContain("hover:bg-text/4");
    expect(vague?.querySelectorAll("[role=note]").length).toBe(2);
    expect(vague?.querySelector("[role=note] svg")).not.toBeNull();
    expect(element.querySelector("#criteria [data-item=AC1] [role=note]")).toBeNull();
  });

  it("shows files by module with actions and sensitive marks; tasks with status and chips (AC4)", async () => {
    const { element, host } = await render();
    const files = element.querySelector("#files");
    expect([...(files?.querySelectorAll("h3") ?? [])].map((heading) => text(heading))).toEqual([
      "auth/",
      "login/",
    ]);
    expect(text(files?.querySelector("[data-action=create]"))).toBe("Crear");
    expect(text(files?.querySelector("[data-sensitive]"))).toBe("Ruta sensible");
    expect(text(files)).toContain("lib/login/old.dart → lib/login/screen.dart");
    const task = element.querySelector("#tasks [data-item=T1]");
    expect(text(task?.querySelector("[data-status]"))).toBe("Activa");
    expect(text(task?.querySelector(".font-mono"))).toBe("T1");
    expect([...(task?.querySelectorAll("sp-badge") ?? [])].map((badge) => text(badge))).toEqual([
      "AC1",
      "AC2",
    ]);
    expect(text(element.querySelector("#risks [data-item=R1] .font-mono"))).toBe("R1");
    expect(text(task)).toContain("lib/auth/google.dart");
    element.querySelector<HTMLButtonElement>("#risks sp-icon-button button")?.click();
    element.querySelector<HTMLButtonElement>("#tasks sp-icon-button button")?.click();
    element.querySelector<HTMLButtonElement>("#criteria sp-icon-button button")?.click();
    expect(host.anchors).toEqual([{ item: "R1" }, { item: "T1" }, { item: "AC1" }]);
  });

  it("AC1: shows a tooltip with the sigla type and content when hovering task criterion badges or item ids", async () => {
    const { element, settle } = await render();
    const badge = element.querySelector<HTMLElement>("#tasks [data-item=T1] sp-badge");
    badge?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    await settle();
    expect(
      document.querySelector(".cdk-overlay-container [data-tooltip]")?.textContent?.trim(),
    ).toBe('Criterio de aceptación AC1: CUANDO alguien pulsa "Entrar" ENTONCES entra.');

    const riskId = element.querySelector<HTMLElement>("#risks [data-item=R1] .font-mono");
    riskId?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    await settle();
    expect(
      document.querySelector(".cdk-overlay-container [data-tooltip]")?.textContent?.trim(),
    ).toBe("Riesgo R1: Google cambia su API.");
  });

  it("offers no comment outside an editable review (AC4)", async () => {
    const { fixture, host, element } = await render();
    host.editable.set(false);
    await fixture.whenStable();
    expect(element.querySelector("sp-review-items sp-icon-button")).toBeNull();
  });

  it("reports a failed action as an error toast", async () => {
    const { fixture, host, element, settle } = await render();
    host.assumption.set({ id: "A9", text: "Falla.", decision: "pending" });
    await fixture.whenStable();
    element.querySelector<HTMLButtonElement>("sp-assumption-row sp-button button")?.click();
    await settle();
    expect(TestBed.inject(Toasts).items()).toEqual([
      expect.objectContaining({ kind: "error", text: "Error: boom" }),
    ]);
  });
});

/** An epic with three slices: C2 after C1, and C3 after both. */
const EPIC = `---
kind: epic
---

# Panel académico

## Objetivo

El docente sigue la asistencia y las faltas de sus cursos en un panel.

## Criterios de aceptación

- AC1: CUANDO el docente abre el panel ENTONCES ve la asistencia de cada curso.
- AC2: CUANDO la familia justifica una falta ENTONCES el docente la ve justificada.

## Cortes

- C1: Asistencia por curso
  - ac: AC1
- C2: Justificar faltas
  - ac: AC2
  - depends: C1
- C3: Avisos a las familias
  - ac: AC1, AC2
  - depends: C1, C2
`;

const EPIC_ID = "20261101-panel-academico";

const EPIC_REVIEW = deriveReview(
  parseSpec(EPIC).spec,
  { ...STATE, id: EPIC_ID, kind: "epic", tasks: {} },
  [],
);

/** A change implementing `slice` of `epic`, in `phase`. */
function sliceRecord(id: string, slice: string, phase: Phase, epic = EPIC_ID): ChangeRecord {
  return {
    spec: `---\nkind: standard\nepic: ${epic}\nslice: ${slice}\n---\n\n${SPEC}`,
    state: { ...STATE, id, phase },
    phaseSince: "2026-11-01T10:00:00.000Z",
  };
}

/**
 * The loaded changes: C1 has a cancelled, an open and a closed change; C2 two open ones; C3 only
 * a change of another epic.
 */
const LOADED = deriveViews([
  sliceRecord("20261102-asistencia-cancelada", "C1", "cancelled"),
  sliceRecord("20261103-asistencia-bis", "C1", "implementing"),
  sliceRecord("20261104-asistencia", "C1", "done"),
  sliceRecord("20261105-justificar", "C2", "implementing"),
  sliceRecord("20261106-justificar-otra-vez", "C2", "draft"),
  sliceRecord("20261107-avisos-de-otra-epica", "C3", "implementing", "20261101-otra-epica"),
]);

/** The slices of the epic, as `sp-review-items` shows them; links only with `epic` and `changes`. */
async function renderSlices(
  options: { readonly links?: boolean; readonly lang?: "es" | "en" } = {},
) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", options.lang ?? "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: SpectyData, useValue: new Recording() }],
  });
  const fixture = TestBed.createComponent(ReviewItems);
  fixture.componentRef.setInput("review", EPIC_REVIEW);
  fixture.componentRef.setInput("section", "slices");
  fixture.componentRef.setInput("editable", true);
  if (options.links === true) {
    fixture.componentRef.setInput("epic", EPIC_ID);
    fixture.componentRef.setInput("changes", LOADED);
  }
  const anchors: CommentAnchor[] = [];
  fixture.componentInstance.comment.subscribe((anchor) => anchors.push(anchor));
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const row = (id: string) => element.querySelector<HTMLElement>(`[data-item=${id}]`);
  return { element, row, anchors };
}

/** The text of each element under `row` that `selector` finds. */
const badges = (row: Element | null, selector: string) =>
  [...(row?.querySelectorAll(selector) ?? [])].map((badge) => text(badge));

describe("ReviewItems on an epic's slices", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: shows each slice as a row with its id, its title, its criteria and the slices it depends on", async () => {
    const { element, row } = await renderSlices();
    expect(
      [...element.querySelectorAll<HTMLElement>("[data-item]")].map((item) => item.dataset.item),
    ).toEqual(["C1", "C2", "C3"]);
    expect(text(row("C1")?.querySelector(".font-mono"))).toBe("C1");
    expect(text(row("C1"))).toContain("Asistencia por curso");
    expect(badges(row("C1"), "sp-badge")).toEqual(["AC1"]);
    expect(row("C1")?.querySelector("[data-depends]")).toBeNull();
    expect(text(row("C2")?.querySelector("[data-depends]"))).toMatch(/^Depende de/);
    expect(badges(row("C2"), "[data-depends] sp-badge")).toEqual(["C1"]);
    expect(badges(row("C3"), "sp-badge")).toEqual(["AC1", "AC2", "C1", "C2"]);
    expect(badges(row("C3"), "[data-depends] sp-badge")).toEqual(["C1", "C2"]);
    // A row of the document, like a task: indented, without lines between the rows.
    expect(row("C1")?.className.split(" ")).toContain("hover:bg-text/4");
    expect(row("C1")?.className).not.toMatch(/\bborder-[bt]\b/);
  });

  it("AC2: offers «Comentar» on each slice of an editable review, anchored to its id", async () => {
    const { row, anchors } = await renderSlices();
    expect(row("C2")?.querySelector("sp-icon-button button")?.getAttribute("aria-label")).toBe(
      "Comentar C2",
    );
    row("C2")?.querySelector<HTMLButtonElement>("sp-icon-button button")?.click();
    row("C1")?.querySelector<HTMLButtonElement>("sp-icon-button button")?.click();
    expect(anchors).toEqual([{ item: "C2" }, { item: "C1" }]);
  });

  it("AC3: links each slice to the change that implements it, with its phase", async () => {
    const { row } = await renderSlices({ links: true });
    // C1: the closed change wins over the open one, and the cancelled one does not count.
    const first = row("C1")?.querySelector<HTMLAnchorElement>("a");
    expect(text(first)).toBe("Asistencia por curso");
    expect(first?.getAttribute("href")).toBe("/changes/20261104-asistencia");
    expect(row("C1")?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("done");
    // C2: no closed change, so the first of the others.
    const second = row("C2")?.querySelector<HTMLAnchorElement>("a");
    expect(second?.getAttribute("href")).toBe("/changes/20261105-justificar");
    expect(row("C2")?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe(
      "implementing",
    );
    // C3: only a change of another epic names it.
    expect(row("C3")?.querySelector("a")).toBeNull();
    expect(row("C3")?.querySelector("sp-phase-badge")).toBeNull();
    expect(text(row("C3"))).toContain("Avisos a las familias");
  });

  it("AC3: shows no link nor phase without the loaded changes", async () => {
    const { element } = await renderSlices();
    expect(element.querySelector("a")).toBeNull();
    expect(element.querySelector("sp-phase-badge")).toBeNull();
  });

  it("AC5: names the Cortes section, its hint and «Depende de» in Spanish and English", async () => {
    expect(SECTION_LABELS).toMatchObject({ slices: { es: "Cortes", en: "Slices" } });
    expect(SECTION_META).toMatchObject({
      slices: {
        hint: {
          es: "Los cambios en que se reparte la épica, y en qué orden.",
          en: "The changes the epic is split into, and in what order.",
        },
      },
    });
    const { row } = await renderSlices({ lang: "en" });
    expect(text(row("C2")?.querySelector("[data-depends]"))).toMatch(/^Depends on/);
  });
});
