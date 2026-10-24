// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { Commands } from "../components/command-palette";
import { Toasts } from "../components/toast";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { ActionError, type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";
import { APP_ROUTES } from "./routes";
import { Shell } from "./shell";

/** A source that cannot switch it: a notice says why and the dialog stays. */
@Injectable()
class Refusing extends FixtureData {
  override setDelegation(): Promise<void> {
    return Promise.reject(
      new ActionError({ es: "Este servidor es de solo lectura.", en: "This server is read only." }),
    );
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
  const chip = () => element.querySelector<HTMLButtonElement>("sp-delegation-chip button");
  const setting = () => element.querySelector("sp-delegation-setting");
  const settingButton = () => setting()?.querySelector<HTMLButtonElement>("sp-button button");
  const dialog = () => document.querySelector<HTMLElement>("[role=dialog]");
  const dialogButton = (label: string) =>
    [...(dialog()?.querySelectorAll<HTMLButtonElement>("sp-button button") ?? [])].find(
      (item) => text(item) === label,
    );
  const toasts = () =>
    TestBed.inject(Toasts)
      .items()
      .map((item) => item.text);
  return { settle, chip, setting, settingButton, dialog, dialogButton, toasts };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("Delegated mode in the UI", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("turns on only after the warning and an explicit yes, and shows the chip (AC1, AC2)", async () => {
    const { chip, setting, settingButton, dialog, dialogButton, settle, toasts } = await render();
    expect(chip()).toBeNull();
    expect(text(setting())).toContain("Apagado: tu agente te pide cada decisión.");
    settingButton()?.click();
    await settle();
    expect(text(dialog())).toContain("Con el modo delegado, tu agente toma sin preguntarte");
    expect(dialog()?.querySelectorAll("li").length).toBe(4);
    expect(dialog()?.querySelector("code")?.textContent).toBe("specty delegate off");
    dialogButton("No, sigo decidiendo yo")?.click();
    await settle();
    expect([dialog(), chip()]).toEqual([null, null]);
    settingButton()?.click();
    await settle();
    dialogButton("Sí, que decida mi agente")?.click();
    await settle();
    expect(dialog()).toBeNull();
    expect(text(chip())).toBe("Modo delegado");
    expect(toasts()).toContain("Modo delegado activado: tu agente toma tus decisiones.");
    expect(text(setting())).toContain("Activo: tu agente decide por ti.");
  });

  it("says since when and who turned it on, and turns it off from the chip (AC1)", async () => {
    const { chip, dialog, dialogButton, settle, toasts } = await render();
    await TestBed.inject(SpectyData).setDelegation(true);
    await settle();
    chip()?.click();
    await settle();
    expect(text(dialog())).toContain("; lo activó Ana Gómez.");
    dialogButton("Desactivar")?.click();
    await settle();
    expect(chip()).toBeNull();
    expect(toasts()).toContain("Modo delegado desactivado: vuelves a decidir tú.");
  });

  it("explains a refusal and keeps the dialog; the palette offers it too (AC2)", async () => {
    const { settingButton, dialog, dialogButton, settle, toasts } = await render(Refusing);
    const command = TestBed.inject(Commands)
      .all()
      .find((entry) => entry.id === "delegation");
    expect(command?.label.es).toBe("Modo delegado…");
    settingButton()?.click();
    await settle();
    dialogButton("Sí, que decida mi agente")?.click();
    await settle();
    expect(toasts()).toContain("Este servidor es de solo lectura.");
    expect(dialog()).not.toBeNull();
    dialogButton("No, sigo decidiendo yo")?.click();
    await settle();
    command?.run();
    await settle();
    expect(text(dialog())).toContain("Con el modo delegado");
  });
});
