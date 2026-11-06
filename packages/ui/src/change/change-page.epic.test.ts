// SPDX-License-Identifier: Apache-2.0
// The page of an epic while its slices are implemented: change-page.test.ts is full, so the epic
// has its own file.
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type Bilingual, type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

/** The sample's changes in implementation: one becomes an epic, the other stays a feature. */
const EPIC = "20261019-boletines-pdf";
const FEATURE = "20261021-login-google";
/** The sample change in review, as an epic: it waits for the person's review, not for an adjustment. */
const EPIC_IN_REVIEW = "20261020-evolucion-trimestre";

const EPIC_SPEC = `---
kind: epic
---

# Boletines del curso

## Objetivo

Las familias reciben el boletín de cada trimestre sin pedirlo.

## Criterios de aceptación

- AC1: CUANDO el docente cierra el trimestre ENTONCES se genera el boletín en PDF.
- AC2: CUANDO el boletín está listo ENTONCES le llega a cada familia.

## Cortes

- C1: Boletín en PDF
  - ac: AC1
- C2: Envío a las familias
  - ac: AC2
  - depends: C1
`;

/** `record` as an epic: no tasks and nothing pending, with the spec above. */
function asEpic(record: ChangeRecord): ChangeRecord {
  return {
    ...record,
    spec: EPIC_SPEC,
    state: {
      ...record.state,
      kind: "epic",
      tasks: {},
      pending: { scopeRequests: [], adjustment: null },
    },
  };
}

/** The sample data with its first change in implementation, and the one in review, as epics. */
@Injectable()
class WithEpic extends FixtureData {
  override async changes(): Promise<readonly ChangeRecord[]> {
    const records = await super.changes();
    return records.map((record) =>
      record.state.id === EPIC || record.state.id === EPIC_IN_REVIEW ? asEpic(record) : record,
    );
  }
}

/** The same data on a server the agent started: nobody decides here. */
@Injectable()
class ReadOnlyEpic extends WithEpic {
  override readOnly(): Promise<Bilingual | undefined> {
    return Promise.resolve({ es: "Solo lectura.", en: "Read only." });
  }
}

async function open(id: string, source: typeof FixtureData = WithEpic) {
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
  await TestBed.inject(Router).navigateByUrl(`/changes/${id}`);
  await settle();
  const hero = () => element.querySelector("sp-change-page [data-hero]");
  const bar = () => element.querySelector("sp-change-page [data-sticky]");
  const buttons = (within: Element | null | undefined) => [
    ...(within?.querySelectorAll<HTMLButtonElement>("sp-button button") ?? []),
  ];
  return { element, settle, hero, bar, buttons };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("ChangePage of an epic in implementation", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: offers «Pedir ajustes…» beside the title and in the compact bar, and says what for", async () => {
    const { settle, hero, bar, buttons } = await open(EPIC);
    expect(text(hero()?.querySelector("h1"))).toBe("Boletines del curso");
    expect(hero()?.querySelector("sp-kind-badge")).not.toBeNull();
    // Beside the title: only the request, with what it is for under it; nothing to accept.
    expect(buttons(hero()).map(text)).toEqual(["Pedir ajustes…"]);
    const actions = hero()?.querySelector("sp-epic-actions");
    expect(actions?.getAttribute("role")).toBe("group");
    expect(text(actions?.querySelector("[data-hint]"))).toBe(
      "Para dividir un corte demasiado grande o añadir uno que falta.",
    );
    expect(hero()?.querySelector("[data-waiting]")).toBeNull();
    // In the compact bar: the same button, small, and no line under it.
    const compact = bar()?.querySelector("sp-epic-actions");
    expect(compact?.hasAttribute("data-compact")).toBe(true);
    expect(buttons(bar()).map(text)).toEqual(["Pedir ajustes…"]);
    expect(compact?.querySelector("[data-hint]")).toBeNull();
    // It opens the dialog of the request.
    buttons(hero())[0]?.click();
    await settle();
    const dialog = document.querySelector("[role=dialog]");
    expect(text(dialog?.querySelector("h2"))).toBe("Pedir ajustes");
  });

  it("AC4: offers no adjustment on a feature in implementation, nor on an epic in review", async () => {
    const feature = await open(FEATURE);
    expect(feature.hero()?.querySelector("sp-epic-actions")).toBeNull();
    expect(feature.bar()?.querySelector("sp-epic-actions")).toBeNull();
    expect(feature.buttons(feature.hero()).map(text)).not.toContain("Pedir ajustes…");
    expect(feature.buttons(feature.bar()).map(text)).not.toContain("Pedir ajustes…");

    const review = await open(EPIC_IN_REVIEW);
    expect(review.hero()?.querySelector("sp-review-actions")).not.toBeNull();
    expect(review.element.querySelector("sp-epic-actions")).toBeNull();
    expect(review.buttons(review.hero()).map(text)).not.toContain("Pedir ajustes…");
  });

  it("AC6: shows it disabled, with the reason under the button, when the source cannot decide", async () => {
    const { hero, bar, buttons } = await open(EPIC, ReadOnlyEpic);
    const [button] = buttons(hero());
    expect(text(button)).toBe("Pedir ajustes…");
    expect(button?.disabled).toBe(true);
    const actions = hero()?.querySelector("sp-epic-actions");
    expect(text(actions?.querySelector("[data-blocked]"))).toBe("Solo lectura.");
    expect(actions?.querySelector("[data-hint]")).toBeNull();
    expect(buttons(bar()).map((compact) => compact.disabled)).toEqual([true]);
  });
});
