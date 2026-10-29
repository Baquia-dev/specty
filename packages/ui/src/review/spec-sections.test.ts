// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { type ChangeState, parseSpec } from "@baquia-dev/specty-core";
import { Toasts } from "../components/toast";
import {
  type AssumptionView,
  type ChangeRecord,
  type CommentAnchor,
  SpectyData,
} from "../data/records";
import { deriveReview } from "../data/review";
import { AssumptionRow } from "./assumption-row";
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
      <sp-assumption-row change="20261021-login-google" [assumption]="assumption()" [editable]="editable()" (comment)="anchors.push($event)" />
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

  it("emits a comment anchored to the item (AC6)", async () => {
    const { element, host } = await render();
    element.querySelector<HTMLButtonElement>("sp-assumption-row sp-icon-button button")?.click();
    expect(host.anchors).toEqual([{ item: "A1" }]);
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
    expect(document.querySelector(".cdk-overlay-container [data-tooltip]")?.textContent?.trim()).toBe(
      'Criterio de aceptación AC1: CUANDO alguien pulsa "Entrar" ENTONCES entra.',
    );

    const riskId = element.querySelector<HTMLElement>("#risks [data-item=R1] .font-mono");
    riskId?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    await settle();
    expect(document.querySelector(".cdk-overlay-container [data-tooltip]")?.textContent?.trim()).toBe(
      "Riesgo R1: Google cambia su API.",
    );
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
