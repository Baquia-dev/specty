// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { Toasts } from "../components/toast";
import { DERIVER } from "../data/changes-store";
import { FixtureData, sampleRecords } from "../data/fixtures";
import { type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

const REVIEW = "20261020-evolucion-trimestre";

class ReadOnly extends SpectyData {
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve(sampleRecords(Date.now()));
  }
  subscribe(): () => void {
    return () => undefined;
  }
}

async function open(id: string, source: new () => SpectyData = FixtureData) {
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
      { provide: SpectyData, useClass: source },
      {
        provide: DERIVER,
        useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
      },
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  const element: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    for (let round = 0; round < 40; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await TestBed.inject(Router).navigateByUrl(`/changes/${id}?tab=spec`);
  await settle();
  const review = () => element.querySelector<HTMLElement>("sp-spec-review");
  const bar = () => review()?.querySelector<HTMLElement>("[role=region]");
  const barButtons = () => [
    ...(bar()?.querySelectorAll<HTMLButtonElement>("sp-button button") ?? []),
  ];
  return { fixture, element, settle, review, bar, barButtons };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("SpecReview", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("shows the sections in order, with an index that marks pending, comments and warnings (AC1)", async () => {
    const { review } = await open(REVIEW);
    const sections = [...(review()?.querySelectorAll<HTMLElement>("[data-section]") ?? [])];
    expect(sections.map((section) => section.dataset.section)).toEqual([
      "goal",
      "outOfScope",
      "assumptions",
      "criteria",
      "files",
      "tasks",
      "design",
    ]);
    const index = [...(review()?.querySelectorAll("nav button") ?? [])].map((button) =>
      text(button),
    );
    expect(index).toContain("Supuestos 1 por revisar, 1 comentarios");
    expect(index).toContain("Criterios 2 por revisar,");
    expect(index).toContain("Tareas 1 por revisar,");
    expect(index).toContain("Diseño 1 comentarios");
    // Every warning counted in the index is visible in its section.
    expect(review()?.querySelectorAll("[data-section=tasks] [role=note]").length).toBe(1);
    expect(review()?.querySelectorAll("[data-section=criteria] [role=note]").length).toBe(2);
    expect(
      review()
        ?.querySelector("[data-section=design] sp-collapsible button")
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(text(review()?.querySelector("[data-section=goal] sp-markdown"))).toContain(
      "agrupada por trimestre",
    );
  });

  it("shows each section as a card with icon, hint and progress; decisions in color, icon and text (AC1)", async () => {
    const { review } = await open(REVIEW);
    const assumptions = review()?.querySelector("[data-section=assumptions]");
    expect(assumptions?.className).toContain("rounded-xl");
    expect(assumptions?.querySelector("header svg")).not.toBeNull();
    expect(text(assumptions?.querySelector("header p"))).toBe(
      "Confirma o rechaza los de alto impacto: aprobar espera por ellos.",
    );
    expect(text(assumptions?.querySelector("[data-progress]"))).toBe(
      "1 de 2 de alto impacto decididos",
    );
    expect(text(review()?.querySelector("[data-section=tasks] [data-progress]"))).toBe(
      "0 de 2 hechas",
    );
    const confirmed = review()?.querySelector<HTMLElement>(
      "sp-assumption-row[data-item=A1] [data-decision]",
    );
    expect(text(confirmed)).toBe("Confirmado");
    expect(confirmed?.style.color).toBe("var(--color-phase-done)");
    expect(confirmed?.querySelector("svg")).not.toBeNull();
    const waiting = review()?.querySelector<HTMLElement>("sp-assumption-row[data-item=A2]");
    expect(waiting?.hasAttribute("data-waiting")).toBe(true);
  });

  it("scrolls to a section smoothly, or at once with reduced motion, and marks it (AC1)", async () => {
    const { review, settle } = await open(REVIEW);
    const calls: ScrollIntoViewOptions[] = [];
    Element.prototype.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => {
      if (typeof options === "object") calls.push(options);
    };
    const criteria = () =>
      [...(review()?.querySelectorAll<HTMLButtonElement>("nav button") ?? [])].find((button) =>
        text(button).startsWith("Criterios"),
      );
    criteria()?.click();
    await settle();
    expect(calls.at(-1)).toEqual({ behavior: "smooth", block: "start" });
    expect(criteria()?.getAttribute("aria-current")).toBe("true");
    expect(document.activeElement?.id).toBe("review-criteria-title");

    window.matchMedia = (() => ({
      matches: true,
      addEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    criteria()?.click();
    expect(calls.at(-1)).toEqual({ behavior: "auto", block: "start" });
    // Test files share globals: leave matchMedia and scrollIntoView as other files expect them.
    window.matchMedia = (() => ({
      matches: false,
      addEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  it("blocks approval with a visible reason until high-impact assumptions are decided (AC7)", async () => {
    const { review, bar, barButtons, settle } = await open(REVIEW);
    expect(text(bar()?.querySelector("[data-blocked]"))).toBe(
      "Falta 1 supuesto de alto impacto por decidir.",
    );
    expect(barButtons()[1]?.disabled).toBe(true);
    const a2 = review()?.querySelector("sp-assumption-row[data-item=A2]");
    a2?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    await settle();
    expect(bar()?.querySelector("[data-blocked]")).toBeNull();
    expect(barButtons()[1]?.disabled).toBe(false);
    expect(text(barButtons()[1])).toBe("Aprobar r2");

    barButtons()[0]?.click();
    await settle();
    expect(TestBed.inject(Toasts).items().at(-1)?.text).toContain("Comentarios enviados");
    barButtons()[1]?.click();
    await settle();
    expect(TestBed.inject(Toasts).items().at(-1)?.text).toBe("Revisión 2 aprobada.");
    expect(review()?.querySelector("[role=region]")).toBeNull();
    expect(review()?.querySelector("sp-assumption-row sp-button")).toBeNull();
  });

  it("comments on an item from its button and on a text selection (AC6)", async () => {
    const { review, settle } = await open(REVIEW);
    review()?.querySelector<HTMLButtonElement>("[data-item=AC3] sp-icon-button button")?.click();
    await settle();
    expect(text(review()?.querySelector("aside [data-target]"))).toBe("Sobre AC3");
    [
      ...(review()?.querySelectorAll<HTMLButtonElement>("aside form sp-button button") ?? []),
    ][0]?.click();
    await settle();

    const goal = review()?.querySelector("[data-section=goal] p")?.firstChild;
    if (!goal) throw new Error("no goal text");
    const range = document.createRange();
    range.setStart(goal, 0);
    range.setEnd(goal, 13);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    await settle();
    expect(text(review()?.querySelector("aside sp-button"))).toContain("Comentar la selección");
  });

  it("is read-only outside review, with comments still visible (AC8)", async () => {
    const { review } = await open("20261021-login-google");
    expect(review()?.querySelector("[role=region]")).toBeNull();
    expect(review()?.querySelector("sp-assumption-row sp-button")).toBeNull();
    expect(review()?.querySelector("aside form")).toBeNull();
    expect(text(review()?.querySelector("aside h2"))).toContain("Comentarios");
  });

  it("explains it when the source cannot take an action (AC9)", async () => {
    const { review, settle } = await open(REVIEW, ReadOnly);
    review()
      ?.querySelector<HTMLButtonElement>("sp-assumption-row[data-item=A2] sp-button button")
      ?.click();
    await settle();
    expect(TestBed.inject(Toasts).items().at(-1)).toMatchObject({
      kind: "error",
      text: "Esta fuente de datos es de solo lectura: no admite acciones.",
    });
  });
});
