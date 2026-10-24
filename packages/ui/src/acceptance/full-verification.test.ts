// SPDX-License-Identifier: Apache-2.0
import { Component, computed, Injectable, inject, input } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Toasts } from "../components/toast";
import { ChangesStore, DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import {
  ActionError,
  type Bilingual,
  type ChangeRecord,
  type ChangeView,
  SpectyData,
} from "../data/records";
import { VERIFY_FULL } from "../data/sample-records";
import { STEP_MS } from "../data/sample-run";
import { deriveViews } from "../data/views";
import { AcceptanceTab } from "./acceptance-tab";

const ASISTENCIA = "20261018-asistencia-curso";

@Component({
  imports: [AcceptanceTab],
  template: `@if (change(); as change) { <sp-acceptance-tab [change]="change" /> }`,
})
class Host {
  readonly id = input(ASISTENCIA);
  /** A view of its own instead of the store's, to try what the samples do not have. */
  readonly view = input<ChangeView | undefined>(undefined);
  private readonly store = inject(ChangesStore);
  readonly change = computed(
    () => this.view() ?? this.store.all().find((item) => item.id === this.id()),
  );
}

/** The sample data on a server the agent started: nobody decides here. */
@Injectable()
class ReadOnly extends FixtureData {
  override readOnly(): Promise<Bilingual | undefined> {
    return Promise.resolve({ es: "Solo lectura.", en: "Read only." });
  }
}

/** A source that cannot run it: a notice says why. */
@Injectable()
class Refusing extends FixtureData {
  override verifyChange(): Promise<void> {
    return Promise.reject(
      new ActionError({ es: "El servidor no responde.", en: "The server does not answer." }),
    );
  }
}

async function render(id = ASISTENCIA, source: typeof FixtureData = FixtureData) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", "es");
  localStorage.removeItem("specty.acceptance.view");
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
  const store = TestBed.inject(ChangesStore);
  const mount = async (view?: ChangeView) => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentRef.setInput("id", id);
    if (view !== undefined) fixture.componentRef.setInput("view", view);
    for (let round = 0; round < 60; round++) {
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve));
      if (!store.views.isLoading()) break;
    }
    await fixture.whenStable();
    return fixture;
  };
  let fixture = await mount();
  const element = () => fixture.nativeElement as HTMLElement;
  const section = () => element().querySelector<HTMLElement>("sp-full-verification");
  const settle = async () => {
    for (let round = 0; round < 10; round++) {
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve));
    }
    await fixture.whenStable();
  };
  const remount = async (view?: ChangeView) => {
    fixture.destroy();
    fixture = await mount(view);
  };
  const toasts = () =>
    TestBed.inject(Toasts)
      .items()
      .map((item) => item.text);
  return { element, section, settle, remount, store, toasts };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("Full verification", () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it("shows its command and that it has not run, above the criteria (AC1)", async () => {
    const { element, section } = await render();
    expect(text(section()?.querySelector("h2"))).toBe("Verificación completa");
    expect(text(section()?.querySelector("[data-meta]"))).toBe(VERIFY_FULL);
    expect(text(section()?.querySelector("[data-full-status]"))).toBe(
      "Sin ejecutar Corre todos los tests del proyecto, no solo los de cada tarea. Ejecutar",
    );
    const order = [...element().querySelectorAll("sp-full-verification, section")].map(
      (item) => item.getAttribute("aria-labelledby") ?? item.tagName.toLowerCase(),
    );
    expect(order).toEqual(["sp-full-verification", "full-verification", "acceptance-criteria"]);
  });

  it("runs live, leaves its result and keeps it on coming back (AC2, AC3)", async () => {
    // Only the run's steps are faked: the store settles on real timeouts.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { section, settle, remount } = await render();
    const said = () => text(section()?.querySelector("[data-announce]"));
    section()?.querySelector<HTMLButtonElement>("[data-run] button")?.click();
    await settle();
    vi.advanceTimersByTime(STEP_MS * 2);
    await settle();
    const live = section()?.querySelector("[data-live]");
    expect(text(live?.firstElementChild)).toMatch(
      /^Verificando · 0:\d\d flutter analyze && flutter test Ocultar salida$/,
    );
    expect(live?.querySelectorAll("[data-log] > span")).toHaveLength(2);
    expect(section()?.querySelector("[data-log]")?.getAttribute("aria-label")).toBe(
      "Salida en vivo de la verificación completa",
    );
    expect(said()).toBe("Verificando todo el cambio: flutter analyze && flutter test.");
    expect(section()?.querySelector("[data-full-status]")).toBeNull();

    vi.advanceTimersByTime(STEP_MS * 20);
    await settle();
    expect(section()?.querySelector("[data-live]")).toBeNull();
    expect(text(section()?.querySelector("[data-verdict]"))).toMatch(/^Correcta · .+ · .+$/);
    expect(text(section()?.querySelector("[data-run]"))).toBe("Ejecutar de nuevo");
    expect(section()?.querySelector("[data-toggle-output]")).toBeNull();
    expect(said()).toBe("La verificación completa fue correcta.");

    // The palette makes the next one fail: its last lines open, and they can be folded.
    const source = TestBed.inject(SpectyData);
    if (!(source instanceof FixtureData)) throw new Error("no sample source");
    source.toggleFullResult();
    section()?.querySelector<HTMLButtonElement>("[data-run] button")?.click();
    await settle();
    vi.advanceTimersByTime(STEP_MS * 20);
    await settle();
    expect(text(section()?.querySelector("[data-verdict]"))).toMatch(/^Falló · /);
    expect(said()).toBe("La verificación completa falló.");
    expect(text(section()?.querySelector("[data-output]"))).toContain("Some tests failed.");
    expect(section()?.querySelector("[data-output] [data-tone=path]")?.textContent?.trim()).toBe(
      "test/reports/totals_test.dart:48:7",
    );
    const toggle = section()?.querySelector<HTMLButtonElement>("[data-toggle-output]");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    toggle?.click();
    await settle();
    expect(section()?.querySelector("[data-output]")).toBeNull();

    await remount();
    expect(text(section()?.querySelector("[data-verdict]"))).toMatch(/^Falló · /);
  });

  it("cannot be run from a read-only server (AC2)", async () => {
    const { section } = await render(ASISTENCIA, ReadOnly);
    expect(section()?.querySelector<HTMLButtonElement>("[data-run] button")?.disabled).toBe(true);
  });

  it("explains it when the source cannot run it (AC4)", async () => {
    const { section, settle, toasts } = await render(ASISTENCIA, Refusing);
    section()?.querySelector<HTMLButtonElement>("[data-run] button")?.click();
    await settle();
    expect(toasts()).toContain("El servidor no responde.");
    expect(section()?.querySelector("[data-live]")).toBeNull();
  });

  it("only runs in acceptance, and is not there without verify.full (AC1, AC5)", async () => {
    const { section, remount, store } = await render("20261019-boletines-pdf");
    expect(text(section()?.querySelector("[data-verdict]"))).toBe("Sin ejecutar");
    expect(section()?.querySelector("[data-run]")).toBeNull();
    const view = store.all().find((item) => item.id === ASISTENCIA);
    if (view === undefined) throw new Error("no view");
    await remount({ ...view, progress: { tasks: view.progress.tasks } });
    expect(section()).toBeNull();
  });
});
