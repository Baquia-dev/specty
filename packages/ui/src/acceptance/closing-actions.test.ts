// SPDX-License-Identifier: Apache-2.0
import { Component, computed, Injectable, inject, input, type Provider } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Toasts } from "../components/toast";
import { ChangesStore, DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { InFlight } from "../data/in-flight";
import { ActionError, type Bilingual, type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";
import { Preferences } from "../theme/preferences";
import { ClosingActions } from "./closing-actions";

const REMINDERS = "20261017-recordatorios-correo";

@Component({
  imports: [ClosingActions],
  template: `
    @if (shown() && change(); as change) {
      <sp-closing-actions [change]="change" [compact]="compact()" />
      @if (bar()) {
        <sp-closing-actions [change]="change" [compact]="true" />
      }
    }
  `,
})
class Host {
  readonly compact = input(false);
  /** The sticky bar too, under the header: both follow the same closing. */
  readonly bar = input(false);
  /** Off while the person is on another page. */
  readonly shown = input(true);
  private readonly store = inject(ChangesStore);
  readonly change = computed(() => this.store.listed().find((item) => item.id === REMINDERS));
}

/** The sample data on a server the agent started: nobody decides here. */
@Injectable()
class ReadOnly extends FixtureData {
  override readOnly(): Promise<Bilingual | undefined> {
    return Promise.resolve({ es: "Solo lectura.", en: "Read only." });
  }
}

/** A source that cannot confirm: a notice says why. */
@Injectable()
class Refusing extends FixtureData {
  override confirmClosing(): Promise<void> {
    return Promise.reject(
      new ActionError({ es: "El servidor no responde.", en: "The server does not answer." }),
    );
  }
}

/**
 * A server that leaves the closing pending, as one waiting for the full verification of another
 * session, until the test makes it answer.
 */
@Injectable()
class Waiting extends FixtureData {
  private answer: (() => void) | undefined;

  override confirmClosing(change: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.answer = resolve;
    }).then(() => super.confirmClosing(change));
  }

  /** The server answers: the closing is confirmed now. */
  answers(): void {
    this.answer?.();
  }
}

/** The line the server said while a closing waits for another session's turn. */
const WAIT =
  "Otra sesión está haciendo una verificación completa (`pnpm check` en /otra/carpeta, desde las 08:00 UTC); espero a que termine para no correr dos a la vez…";

/** The tab's actions in flight once the server said why the closing of REMINDERS waits. */
@Injectable()
class Said {
  of(change: string) {
    return change === REMINDERS ? { kind: "close", note: WAIT } : undefined;
  }
}

async function render(
  source: typeof FixtureData = FixtureData,
  compact = false,
  providers: readonly Provider[] = [],
) {
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SpectyData, useClass: source },
      {
        provide: DERIVER,
        useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
      },
      ...providers,
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
  const buttons = () => [
    ...element.querySelectorAll<HTMLButtonElement>("sp-closing-actions button"),
  ];
  const dialog = () => document.querySelector<HTMLElement>("[role=dialog]");
  const dialogButton = (label: string) =>
    [...(dialog()?.querySelectorAll<HTMLButtonElement>("sp-button button") ?? [])].find(
      (item) => text(item) === label,
    );
  const view = () => store.listed().find((item) => item.id === REMINDERS);
  const toasts = () =>
    TestBed.inject(Toasts)
      .items()
      .map((item) => item.text);
  return { fixture, element, settle, button, buttons, dialog, dialogButton, view, toasts };
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

  it("AC2: says why it could not close, with the dialog closed and the button back", async () => {
    const { button, dialog, dialogButton, settle, view, toasts } = await render(Refusing);
    button()?.click();
    await settle();
    dialogButton("Confirmar y archivar")?.click();
    await settle();
    expect(toasts()).toContain("El servidor no responde.");
    expect(dialog()).toBeNull();
    expect(view()?.phase).toBe("closing");
    expect(button()?.disabled).toBe(false);
    expect(button()?.hasAttribute("aria-busy")).toBe(false);
  });
});

describe("Closing while the server has not answered", () => {
  afterEach(() => TestBed.resetTestingModule());

  /** The waiting server, to make it answer. */
  function server(): Waiting {
    const source = TestBed.inject(SpectyData);
    if (!(source instanceof Waiting)) throw new Error("no waiting source");
    return source;
  }

  /** Opens «Confirmar y archivar» in the header and confirms. */
  async function confirm(page: Awaited<ReturnType<typeof render>>): Promise<void> {
    page.button()?.click();
    await page.settle();
    page.dialogButton("Confirmar y archivar")?.click();
    await page.settle();
  }

  it("AC2: closes the dialog at once, and the header and the bar wait until the server answers", async () => {
    const page = await render(Waiting);
    page.fixture.componentRef.setInput("bar", true);
    await page.settle();
    await confirm(page);
    expect(page.dialog()).toBeNull();
    expect(page.buttons()).toHaveLength(2);
    for (const button of page.buttons()) {
      expect(button.getAttribute("aria-busy")).toBe("true");
      expect(button.disabled).toBe(true);
      expect(button.querySelector(".animate-spin")).not.toBeNull();
    }
    expect(page.toasts()).toEqual([]);
    expect(page.view()?.phase).toBe("closing");

    server().answers();
    await page.settle();
    expect(page.view()?.phase).toBe("done");
    expect(page.toasts()).toContain("Cierre confirmado: el cambio está terminado y archivado.");
    expect(page.buttons().some((button) => button.hasAttribute("aria-busy"))).toBe(false);
  });

  it("AC3: says «Cerrando…» under the header button, not in the bar", async () => {
    const page = await render(Waiting);
    page.fixture.componentRef.setInput("bar", true);
    await page.settle();
    const groups = () => [...page.element.querySelectorAll("sp-closing-actions")];
    expect(groups()[0]?.querySelector("[data-in-flight]")).toBeNull();
    await confirm(page);
    expect(text(groups()[0]?.querySelector("[data-in-flight]"))).toBe("Cerrando…");
    expect(groups()[1]?.querySelector("[data-in-flight]")).toBeNull();

    TestBed.inject(Preferences).lang.set("en");
    await page.settle();
    expect(text(groups()[0]?.querySelector("[data-in-flight]"))).toBe("Closing…");

    server().answers();
    await page.settle();
    expect(groups()[0]?.querySelector("[data-in-flight]")).toBeNull();
  });

  it("AC3: says the server's line under the header button instead of «Cerrando…», not in the bar", async () => {
    const page = await render(FixtureData, false, [{ provide: InFlight, useClass: Said }]);
    page.fixture.componentRef.setInput("bar", true);
    await page.settle();
    const groups = () => [...page.element.querySelectorAll("sp-closing-actions")];
    expect(text(groups()[0]?.querySelector("[data-in-flight]"))).toBe(WAIT);
    expect(groups()[1]?.querySelector("[data-in-flight]")).toBeNull();
    for (const button of page.buttons()) {
      expect(button.getAttribute("aria-busy")).toBe("true");
    }
    expect(page.buttons()).toHaveLength(2);
  });

  it("AC4: still shows it closing after leaving the page and coming back", async () => {
    const page = await render(Waiting);
    await confirm(page);
    page.fixture.componentRef.setInput("shown", false);
    await page.settle();
    expect(page.button()).toBeNull();
    page.fixture.componentRef.setInput("shown", true);
    await page.settle();
    expect(page.button()?.getAttribute("aria-busy")).toBe("true");
    expect(text(page.element.querySelector("[data-in-flight]"))).toBe("Cerrando…");

    server().answers();
    await page.settle();
    expect(page.element.querySelector("[data-in-flight]")).toBeNull();
  });
});
