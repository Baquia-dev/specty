// SPDX-License-Identifier: Apache-2.0
import { Component, Injectable, input } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Toasts } from "../components/toast";
import { FixtureData } from "../data/fixtures";
import { ActionError, type Bilingual, type ChangeRecord, SpectyData } from "../data/records";
import { deriveView } from "../data/views";
import { TestsActions } from "./tests-actions";

const ID = "20261028-justificantes-faltas";
const SENT_AT = "2026-10-28T10:00:00.000Z";

/** A change in `testing` whose agent sent two red tests. */
const TESTING: ChangeRecord = {
  spec: `---
kind: standard
---

# Justificantes de faltas

## Objetivo

Las familias justifican una falta desde la app.

## Fuera de alcance

- Ninguno

## Criterios de aceptación

- AC1: CUANDO la familia envía un justificante ENTONCES la falta queda justificada.

## Archivos

- crear lib/faltas/justificante.dart — el formulario

## Tareas

- [ ] T1: El formulario del justificante
  - files: lib/faltas/justificante.dart
  - ac: AC1
  - verify: flutter test
`,
  state: {
    schema: 1,
    id: ID,
    kind: "standard",
    phase: "testing",
    revision: 1,
    items: {},
    tasks: { T1: { status: "pending", attempts: 0, scopeExtra: [] } },
    pending: { scopeRequests: [], adjustment: null },
    maxIds: {},
    testsSubmittedAt: SENT_AT,
  },
  phaseSince: SENT_AT,
  audit: [
    {
      ts: SENT_AT,
      actor: "agent",
      event: "tests.proposed",
      data: {
        count: 2,
        files: ["test/justificante_test.dart", "test/aviso_test.dart"],
        red: [{ cmd: "flutter test", exit: 1 }],
      },
    },
  ],
};

@Component({
  imports: [TestsActions],
  template: `<sp-tests-actions [change]="change" [compact]="compact()" />`,
})
class Host {
  readonly compact = input(false);
  readonly change = deriveView(TESTING);
}

/** Notes what it approves, as the server would, without any change of its own to edit. */
@Injectable()
class Approving extends FixtureData {
  readonly approved: [string, number][] = [];
  override approve(change: string, revision: number): Promise<void> {
    this.approved.push([change, revision]);
    return Promise.resolve();
  }
}

@Injectable()
class Refusing extends Approving {
  override approve(): Promise<void> {
    return Promise.reject(
      new ActionError({ es: "El servidor no responde.", en: "The server does not answer." }),
    );
  }
}

/** The sample data on a server the agent started: nobody decides here. */
@Injectable()
class ReadOnly extends Approving {
  override readOnly(): Promise<Bilingual | undefined> {
    return Promise.resolve({ es: "Solo lectura.", en: "Read only." });
  }
}

async function render(kind: typeof Approving = Approving, compact = false) {
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: SpectyData, useClass: kind }] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentRef.setInput("compact", compact);
  const settle = async () => {
    for (let round = 0; round < 20; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  const button = () => element.querySelector<HTMLButtonElement>("sp-tests-actions button");
  const dialog = () => document.querySelector<HTMLElement>("[role=dialog]");
  const dialogButton = (label: string) =>
    [...(dialog()?.querySelectorAll<HTMLButtonElement>("sp-button button") ?? [])].find(
      (item) => text(item) === label,
    );
  const toasts = () =>
    TestBed.inject(Toasts)
      .items()
      .map((item) => item.text);
  const source = TestBed.inject(SpectyData) as Approving;
  return { element, settle, button, dialog, dialogButton, toasts, source };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("Tests actions", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("offers approving the tests, compact in the bar (AC3)", async () => {
    const { element, button } = await render();
    expect(text(button())).toBe("Aprobar los tests");
    const group = element.querySelector("sp-tests-actions");
    expect(group?.getAttribute("role")).toBe("group");
    expect(group?.getAttribute("aria-label")).toBe("Decisión sobre los tests");
    expect(group?.hasAttribute("data-compact")).toBe(false);
    const compact = await render(Approving, true);
    expect(compact.element.querySelector("sp-tests-actions")?.hasAttribute("data-compact")).toBe(
      true,
    );
  });

  it("AC3: approves the current revision once confirmed, and a notice says so", async () => {
    const { button, dialog, dialogButton, settle, toasts, source } = await render();
    button()?.click();
    await settle();
    expect(text(dialog()?.querySelector("h2"))).toBe(
      "Aprobar los tests de «Justificantes de faltas»",
    );
    expect(text(dialog()?.querySelector("[data-what]"))).toBe(
      "Los 2 tests nuevos quedan bloqueados: el agente ya no puede cambiarlos ni borrarlos sin que lo decidas. Después escribe el código que los pone en verde.",
    );
    expect(text(dialog()?.querySelector("[data-after]"))).toContain(
      "díselo al agente antes de aprobar",
    );
    // Cancelling approves nothing.
    dialogButton("Cancelar")?.click();
    await settle();
    expect([dialog(), source.approved]).toEqual([null, []]);
    button()?.click();
    await settle();
    dialogButton("Aprobar los tests")?.click();
    await settle();
    expect(dialog()).toBeNull();
    expect(source.approved).toEqual([[ID, 1]]);
    expect(toasts()).toContain("Tests aprobados: quedan bloqueados y empieza la implementación.");
  });

  it("AC3: keeps the dialog and explains it when the source cannot approve", async () => {
    const { button, dialog, dialogButton, settle, toasts } = await render(Refusing);
    button()?.click();
    await settle();
    dialogButton("Aprobar los tests")?.click();
    await settle();
    expect(toasts()).toContain("El servidor no responde.");
    expect(dialog()).not.toBeNull();
    dialogButton("Cancelar")?.click();
    await settle();
  });

  it("AC3: offers no approval on a read-only server", async () => {
    const { button } = await render(ReadOnly);
    expect(button()?.disabled).toBe(true);
  });
});
