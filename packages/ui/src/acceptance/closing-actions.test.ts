// SPDX-License-Identifier: Apache-2.0
import { Component, computed, Injectable, inject, input } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Toasts } from "../components/toast";
import { ChangesStore, DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { ActionError, type Bilingual, type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";
import { ClosingActions } from "./closing-actions";

const REMINDERS = "20261017-recordatorios-correo";

@Component({
  imports: [ClosingActions],
  template: `@if (change(); as change) { <sp-closing-actions [change]="change" [compact]="compact()" /> }`,
})
class Host {
  readonly compact = input(false);
  private readonly store = inject(ChangesStore);
  readonly change = computed(() => this.store.all().find((item) => item.id === REMINDERS));
}

/** A source that cannot confirm: the dialog stays and a notice says why. */
/** The sample data on a server the agent started: nobody decides here. */
@Injectable()
class ReadOnly extends FixtureData {
  override readOnly(): Promise<Bilingual | undefined> {
    return Promise.resolve({ es: "Solo lectura.", en: "Read only." });
  }
}

@Injectable()
class Refusing extends FixtureData {
  override confirmClosing(): Promise<void> {
    return Promise.reject(
      new ActionError({ es: "El servidor no responde.", en: "The server does not answer." }),
    );
  }
}

async function render(source: typeof FixtureData = FixtureData, compact = false) {
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SpectyData, useClass: source },
      {
        provide: DERIVER,
        useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
      },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentRef.setInput("compact", compact);
  const store = TestBed.inject(ChangesStore);
  const settle = async () => {
    for (let round = 0; round < 60; round++) {
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve));
      if (!store.views.isLoading()) break;
    }
    await fixture.whenStable();
  };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  const button = () => element.querySelector<HTMLButtonElement>("sp-closing-actions button");
  const dialog = () => document.querySelector<HTMLElement>("[role=dialog]");
  const dialogButton = (label: string) =>
    [...(dialog()?.querySelectorAll<HTMLButtonElement>("sp-button button") ?? [])].find(
      (item) => text(item) === label,
    );
  const view = () => store.all().find((item) => item.id === REMINDERS);
  const toasts = () =>
    TestBed.inject(Toasts)
      .items()
      .map((item) => item.text);
  return { element, settle, button, dialog, dialogButton, view, toasts };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("Closing actions", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("offers no confirmation on a read-only server (AC2)", async () => {
    const { button } = await render(ReadOnly);
    expect(button()?.disabled).toBe(true);
  });

  it("offers confirming and archiving, compact in the bar", async () => {
    const { element, button } = await render();
    expect(text(button())).toBe("Confirmar y archivar");
    const group = element.querySelector("sp-closing-actions");
    expect(group?.getAttribute("role")).toBe("group");
    expect(group?.getAttribute("aria-label")).toBe("Decisión sobre el cierre");
    expect(group?.hasAttribute("data-compact")).toBe(false);
    const compact = await render(FixtureData, true);
    expect(compact.element.querySelector("sp-closing-actions")?.hasAttribute("data-compact")).toBe(
      true,
    );
  });

  it("confirms after saying there is no way back, and the change is done (AC3)", async () => {
    const { button, dialog, dialogButton, settle, view, toasts } = await render();
    button()?.click();
    await settle();
    expect(text(dialog()?.querySelector("h2"))).toBe(
      "Confirmar el cierre de «Recordatorios de tareas por correo»",
    );
    expect(text(dialog()?.querySelector("[data-what]"))).toContain("se archiva con su cierre");
    expect(text(dialog()?.querySelector("[data-after]"))).toContain("No se puede deshacer");
    // Cancelling changes nothing.
    dialogButton("Cancelar")?.click();
    await settle();
    expect(dialog()).toBeNull();
    expect(view()?.phase).toBe("closing");
    button()?.click();
    await settle();
    dialogButton("Confirmar y archivar")?.click();
    await settle();
    expect(dialog()).toBeNull();
    expect(view()?.phase).toBe("done");
    expect(toasts()).toContain("Cierre confirmado: el cambio está terminado y archivado.");
  });

  it("keeps the dialog and explains it when the source cannot confirm (AC4)", async () => {
    const { button, dialog, dialogButton, settle, view, toasts } = await render(Refusing);
    button()?.click();
    await settle();
    dialogButton("Confirmar y archivar")?.click();
    await settle();
    expect(toasts()).toContain("El servidor no responde.");
    expect(dialog()).not.toBeNull();
    expect(view()?.phase).toBe("closing");
  });
});
