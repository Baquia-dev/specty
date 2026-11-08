// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { Commands } from "../components/command-palette";
import { Toasts } from "../components/toast";
import { DERIVER } from "../data/changes-store";
import { FixtureData, REVIEWER } from "../data/fixtures";
import {
  ActionError,
  type Bilingual,
  type ChangeRecord,
  SpectyData,
  type SpectySwitch,
} from "../data/records";
import { deriveViews } from "../data/views";
import { APP_ROUTES } from "./routes";
import { Shell } from "./shell";

/** A source that refuses to switch it: a notice says why and the dialog stays. */
@Injectable()
class Refusing extends FixtureData {
  override setSpecty(): Promise<void> {
    return Promise.reject(
      new ActionError({
        es: "El servidor no pudo escribir el registro.",
        en: "The server could not write the log.",
      }),
    );
  }
}

/** The sample data on a server the agent started: nobody decides here. */
@Injectable()
class ReadOnly extends FixtureData {
  override readOnly(): Promise<Bilingual | undefined> {
    return Promise.resolve({ es: "Solo lectura.", en: "Read only." });
  }
}

/** A source that knows nothing of the switch, as the MCP App's. */
@Injectable()
class Unknowing extends FixtureData {
  override specty(): Promise<SpectySwitch | undefined> {
    return Promise.resolve(undefined);
  }
}

async function render(source: typeof FixtureData = FixtureData) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
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
  await TestBed.inject(Router).navigateByUrl("/");
  const settle = async () => {
    for (let round = 0; round < 30; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  const toggle = () => element.querySelector<HTMLButtonElement>("header [role=switch]");
  const dialog = () => document.querySelector<HTMLElement>("[role=dialog]");
  const dialogButton = (label: string) =>
    [...(dialog()?.querySelectorAll<HTMLButtonElement>("sp-button button") ?? [])].find(
      (item) => text(item) === label,
    );
  const log = () => [...(dialog()?.querySelectorAll("[data-log] li") ?? [])].map(text);
  const toasts = () =>
    TestBed.inject(Toasts)
      .items()
      .map((item) => item.text);
  const command = () =>
    TestBed.inject(Commands)
      .all()
      .find((entry) => entry.id === "specty-switch");
  return { settle, toggle, dialog, dialogButton, log, toasts, command };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("Specty's switch in the header", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC3: shows the «Specty» switch, checked while on, and nothing when the source does not know it", async () => {
    const { toggle, settle } = await render();
    expect(toggle()?.getAttribute("aria-checked")).toBe("true");
    expect(toggle()?.getAttribute("aria-label")).toBe("Specty");
    expect(text(toggle())).toContain("Specty");
    await TestBed.inject(SpectyData).setSpecty(false);
    await settle();
    expect(toggle()?.getAttribute("aria-checked")).toBe("false");
    const unknowing = await render(Unknowing);
    expect(unknowing.toggle()).toBeNull();
  });

  it("AC4: explains turning it off, shows the log and turns it off only on confirming", async () => {
    const { toggle, dialog, dialogButton, log, settle, toasts } = await render();
    toggle()?.click();
    await settle();
    expect(text(dialog())).toContain("Apagar Specty");
    expect(text(dialog())).toContain("nada de lo que hace tu agente pasa por Specty");
    expect(dialog()?.querySelector("code")?.textContent).toBe("specty next");
    expect(log()[0]).toContain("Encendido");
    expect(log()[0]).toContain(REVIEWER);
    dialogButton("Cancelar")?.click();
    await settle();
    expect(dialog()).toBeNull();
    expect(toggle()?.getAttribute("aria-checked")).toBe("true");
    expect((await TestBed.inject(SpectyData).specty())?.on).toBe(true);

    toggle()?.click();
    await settle();
    dialogButton("Apagar")?.click();
    await settle();
    expect(dialog()).toBeNull();
    expect(toggle()?.getAttribute("aria-checked")).toBe("false");
    expect(toasts()).toContain("Specty apagado: tu agente trabaja sin el flujo.");
  });

  it("AC4: says since when and who turned it off, with the log, and turns it on again", async () => {
    const { toggle, dialog, dialogButton, log, settle, toasts } = await render();
    await TestBed.inject(SpectyData).setSpecty(false);
    await settle();
    toggle()?.click();
    await settle();
    expect(text(dialog())).toContain("Encender Specty");
    expect(text(dialog())).toContain("Apagado desde el");
    expect(text(dialog())).toContain(`; lo apagó ${REVIEWER}.`);
    expect(text(dialog())).toContain("vuelven a actuar como antes");
    expect(log()[0]).toContain("Apagado");
    expect(log()[0]).toContain(REVIEWER);
    expect(log()[1]).toContain("Encendido");
    dialogButton("Encender")?.click();
    await settle();
    expect(dialog()).toBeNull();
    expect(toggle()?.getAttribute("aria-checked")).toBe("true");
    expect(toasts()).toContain("Specty encendido: tu agente vuelve a seguir el flujo.");
  });

  it("AC4: explains a refusal and keeps the dialog; the palette offers it too", async () => {
    const { toggle, dialog, dialogButton, settle, toasts, command } = await render(Refusing);
    expect(command()?.label).toEqual({
      es: "Encender o apagar Specty…",
      en: "Turn Specty on or off…",
    });
    toggle()?.click();
    await settle();
    dialogButton("Apagar")?.click();
    await settle();
    expect(toasts()).toContain("El servidor no pudo escribir el registro.");
    expect(dialog()).not.toBeNull();
    expect(toggle()?.getAttribute("aria-checked")).toBe("true");
    dialogButton("Cancelar")?.click();
    await settle();
    expect(dialog()).toBeNull();
    command()?.run();
    await settle();
    expect(text(dialog())).toContain("Apagar Specty");
  });

  it("AC5: on a read-only server it shows the state, disabled with the reason", async () => {
    const { toggle, dialog, dialogButton, log, settle, command } = await render(ReadOnly);
    expect(toggle()?.getAttribute("aria-checked")).toBe("true");
    expect(toggle()?.disabled).toBe(true);
    const reason = document.getElementById(toggle()?.getAttribute("aria-describedby") ?? "");
    expect(text(reason)).toBe("Solo lectura.");
    toggle()?.click();
    await settle();
    expect(dialog()).toBeNull();
    command()?.run();
    await settle();
    expect(text(dialog())).toContain("Apagar Specty");
    expect(log()[0]).toContain("Encendido");
    expect(dialogButton("Apagar")?.disabled).toBe(true);
  });
});
