// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { Toasts } from "../components/toast";
import { DERIVER } from "../data/changes-store";
import { FixtureData, sampleRecords } from "../data/fixtures";
import { ActionError, type Bilingual, type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

/** The sample change whose folder is lost in these tests. */
const LOST = sampleRecords(Date.now())[0]?.state.id ?? "";

/** The sample data, with LOST as the server sends it once its folder is gone. */
@Injectable()
class WithLost extends FixtureData {
  readonly restored: string[] = [];

  override async changes(): Promise<readonly ChangeRecord[]> {
    return (await super.changes()).map((record) => {
      if (record.state.id !== LOST) return record;
      const { folder: _, ...rest } = record;
      return { ...rest, lost: true };
    });
  }

  override restoreFolder(change: string): Promise<void> {
    this.restored.push(change);
    return Promise.resolve();
  }
}

/** A source that cannot bring the folder back, with the server's reason. */
@Injectable()
class Refusing extends WithLost {
  override restoreFolder(): Promise<void> {
    return Promise.reject(
      new ActionError({ es: "Git no pudo recrear la carpeta.", en: "Git could not." }),
    );
  }
}

/** The same data on a server the agent started: nobody acts here. */
@Injectable()
class ReadOnly extends WithLost {
  override readOnly(): Promise<Bilingual | undefined> {
    return Promise.resolve({ es: "Solo lectura: lo arrancó el agente.", en: "Read only." });
  }
}

async function open(url: string, source: typeof WithLost = WithLost) {
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
  await TestBed.inject(Router).navigateByUrl(url);
  await settle();
  const toasts = () =>
    TestBed.inject(Toasts)
      .items()
      .map((item) => item.text);
  const button = () => element.querySelector<HTMLButtonElement>("sp-lost-folder sp-button button");
  return { element, settle, toasts, button, source: TestBed.inject(SpectyData) as WithLost };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("a change without its folder in the UI", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC3: carries the «Sin carpeta» mark in its Inbox row, and only it", async () => {
    const { element } = await open("/");
    const rows = [...element.querySelectorAll("sp-inbox-row")];
    const row = rows.find((item) => item.querySelector(`a[href^="/changes/${LOST}"]`) !== null);
    expect(text(row?.querySelector("[data-lost]"))).toBe("Sin carpeta");
    expect(rows.filter((item) => item.querySelector("[data-lost]") !== null)).toHaveLength(1);
  });

  it("AC4: its page explains what happened, offers to bring it back and the command, without tabs", async () => {
    const { element, button } = await open(`/changes/${LOST}`);
    const panel = element.querySelector("sp-change-page sp-lost-folder");
    expect(panel).not.toBeNull();
    expect(element.querySelectorAll("sp-change-page [role=tab]")).toHaveLength(0);
    expect(text(panel?.querySelector("[data-what]"))).toBe(
      "La carpeta de este cambio se perdió: alguien la borró o git la podó. El cambio sigue en su rama, desde la que se recupera; lo que no estaba confirmado en la rama cuando se perdió no vuelve.",
    );
    expect(text(button())).toBe("Recuperar carpeta");
    expect(text(panel?.querySelector("[data-command]"))).toBe(
      `En la terminal: specty restore ${LOST}`,
    );
  });

  it("AC5: brings the folder back and says so", async () => {
    const { button, settle, toasts, source } = await open(`/changes/${LOST}`);
    button()?.click();
    await settle();
    expect(source.restored).toEqual([LOST]);
    expect(toasts()).toContain("Carpeta recuperada: el cambio vuelve a tener su carpeta.");
  });

  it("AC5: shows the reason when the folder could not be brought back", async () => {
    const { button, settle, toasts } = await open(`/changes/${LOST}`, Refusing);
    button()?.click();
    await settle();
    expect(toasts().join(" ")).toContain("Git no pudo recrear la carpeta.");
    expect(button()?.disabled).toBe(false);
  });

  it("AC5: on a read-only server, the button is off and the page says why", async () => {
    const { element, button } = await open(`/changes/${LOST}`, ReadOnly);
    expect(button()?.disabled).toBe(true);
    expect(text(element.querySelector("sp-lost-folder [data-blocked]"))).toBe(
      "Solo lectura: lo arrancó el agente.",
    );
  });
});
