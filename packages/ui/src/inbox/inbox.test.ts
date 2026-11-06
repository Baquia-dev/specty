// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData, sampleRecords } from "../data/fixtures";
import type { ChangeRecord as ChangeRecordForTest } from "../data/records";
import { type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecordForTest[]) => Promise.resolve(deriveViews(records)),
};

/** The sample project, or the given records with how the Inbox groups them. */
async function open(given?: {
  readonly records: readonly ChangeRecord[];
  readonly group?: string;
}) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", "es");
  if (given?.group !== undefined) localStorage.setItem("specty.inbox.group", given.group);
  class Given extends SpectyData {
    changes(): Promise<readonly ChangeRecord[]> {
      return Promise.resolve(given?.records ?? []);
    }
    subscribe(): () => void {
      return () => undefined;
    }
  }
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(APP_ROUTES, withComponentInputBinding()),
      { provide: SpectyData, useClass: given === undefined ? FixtureData : Given },
      IN_THREAD,
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  const router = TestBed.inject(Router);
  const element: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    for (let round = 0; round < 40; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await router.navigateByUrl("/");
  await settle();
  const fixtures = TestBed.inject(SpectyData) as FixtureData;
  const rows = () => [...element.querySelectorAll<HTMLElement>("sp-inbox sp-inbox-row")];
  const row = (id: string) => rows().find((item) => item.dataset.id === id);
  const sections = () =>
    [...element.querySelectorAll<HTMLElement>("sp-inbox section")].map(
      (section) =>
        `${text(section.querySelector("h2"))} ${text(section.querySelector("[data-meta]"))}`,
    );
  const search = () => element.querySelector<HTMLInputElement>("sp-inbox-toolbar input");
  const press = (key: string) =>
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  const typeIn = async (value: string) => {
    const input = search();
    if (input === null) throw new Error("no search");
    input.value = value;
    input.dispatchEvent(new Event("input"));
    await settle();
  };
  return { fixture, element, router, settle, fixtures, rows, row, sections, search, press, typeIn };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const short = (id: string | undefined) => id?.replace(/^\d+-/, "");

describe("Inbox while loading", () => {
  it("shows skeletons with the final shape, announced once", async () => {
    class Pending extends SpectyData {
      changes(): Promise<readonly ChangeRecord[]> {
        return new Promise(() => undefined);
      }
      subscribe(): () => void {
        return () => undefined;
      }
    }
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(APP_ROUTES, withComponentInputBinding()),
        { provide: SpectyData, useClass: Pending },
        IN_THREAD,
      ],
    });
    const fixture = TestBed.createComponent(Shell);
    await TestBed.inject(Router).navigateByUrl("/");
    // The source never answers, so the app never becomes stable: advance by hand.
    for (let round = 0; round < 20; round++) {
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve));
    }
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll("sp-inbox sp-skeleton")).toHaveLength(3);
    expect(element.querySelectorAll("sp-inbox [role=status]")).toHaveLength(1);
    TestBed.resetTestingModule();
  });
});

describe("Inbox", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("shows every change as a document row, by state and longest wait first (AC1)", async () => {
    const { element, rows, row, sections } = await open();
    expect(text(element.querySelector("sp-inbox h1"))).toBe("Bandeja");
    expect(text(element.querySelector("[data-summary]"))).toBe(
      "6 decisiones · 2 en curso · 2 recientes",
    );
    expect(sections()).toEqual(["Esperan tu decisión 6", "En curso 2", "Recientes 2"]);
    expect(rows().map((item) => short(item.dataset.id))).toEqual([
      "asistencia-curso",
      "recordatorios-correo",
      "justificar-faltas",
      "evolucion-trimestre",
      "avisos-calificaciones",
      "boletines-pdf",
      "login-google",
      "modo-oscuro",
      "chat-docentes",
      "redondeo-promedios",
    ]);
    // No cards: rows under a divider, indented, lighting up on hover.
    expect(element.querySelector("sp-inbox sp-card")).toBeNull();
    expect(element.querySelector("sp-inbox [role=list]")?.className).toContain("pl-6");
    const first = rows()[0];
    expect(first?.getAttribute("aria-current")).toBe("true");
    expect(first?.className).toContain("hover:bg-text/4");
    expect(first?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("acceptance");
    expect(text(first?.querySelector("[data-waits]"))).toMatch(/^Resultado por aceptar · S/);
    // How long goes under the phase, apart from the action.
    const since = first?.querySelector("[data-since]");
    expect(since?.parentElement?.querySelector("sp-phase-badge")).not.toBeNull();
    expect(since?.parentElement?.querySelector("sp-button")).toBeNull();
    expect(text(first?.querySelector("sp-button"))).toBe("Revisar resultado");
    expect(first?.querySelector("sp-button button")?.className).toContain("bg-accent");
    expect(text(row("20261016-justificar-faltas")?.querySelector("[data-waits]"))).toContain(
      "Spec por revisar · revisión 3, frente a la 2 aprobada",
    );
    expect(text(row("20261020-evolucion-trimestre")?.querySelector("[data-waits]"))).toMatch(
      /^Spec por revisar · revisión 2 · /,
    );
    expect(text(row("20261020-evolucion-trimestre")?.querySelector("[data-note]"))).toBe(
      "1 supuesto de alto impacto por confirmar",
    );
    expect(text(row("20261019-boletines-pdf")?.querySelector("[data-note]"))).toBe(
      "T3 pide lib/shared/pdf/layout.dart: «La firma necesita el maquetador compartido.»",
    );
    expect(text(row("20261021-login-google")?.querySelector("[data-progress]"))).toBe(
      "1 de 2 tareas",
    );
    expect(row("20261021-login-google")?.querySelector("sp-button")).toBeNull();
  });

  it("moves with j/k, focusing the change so Enter opens it (AC1)", async () => {
    const { fixture, rows, press } = await open();
    press("j");
    press("j");
    await fixture.whenStable();
    expect(rows()[2]?.getAttribute("aria-current")).toBe("true");
    expect(document.activeElement).toBe(rows()[2]?.querySelector("a"));
    for (let step = 0; step < 12; step++) press("j");
    await fixture.whenStable();
    expect(rows().at(-1)?.getAttribute("aria-current")).toBe("true");
    press("k");
    await fixture.whenStable();
    expect(rows().at(-2)?.getAttribute("aria-current")).toBe("true");
  });

  it("keeps a row reached with j/k under the fixed bar, as tall as it is (AC3)", async () => {
    // jsdom measures nothing: this observer reports at once, and the bar is 120 px tall.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private readonly report: () => void) {}
        observe(target: HTMLElement) {
          Object.defineProperty(target, "offsetHeight", { value: 120 });
          this.report();
        }
        disconnect() {}
      },
    );
    const { element, rows } = await open();
    const inbox = element.querySelector<HTMLElement>("sp-inbox");
    expect(inbox?.style.getPropertyValue("--sp-sticky-top")).toBe("120px");
    expect(rows()[0]?.className).toContain("scroll-mt-[calc(var(--sp-sticky-top,9rem)+0.5rem)]");
    vi.unstubAllGlobals();
  });

  it("finds by title or id, ignoring case and accents; / to search and Escape to clear (AC2)", async () => {
    const { fixture, rows, search, press, typeIn } = await open();
    press("/");
    await fixture.whenStable();
    expect(document.activeElement).toBe(search());
    await typeIn("EVOLUCION");
    expect(rows().map((item) => short(item.dataset.id))).toEqual(["evolucion-trimestre"]);
    search()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await fixture.whenStable();
    expect(search()?.value).toBe("");
    expect(rows()).toHaveLength(10);
  });

  it("keeps the view when coming back from a change, with a clean URL (AC6)", async () => {
    const { element, router, rows, settle, search, typeIn } = await open();
    await typeIn("pdf");
    element.querySelector<HTMLButtonElement>("[data-group] button:nth-child(2)")?.click();
    await settle();
    expect(router.url).toBe("/");
    rows()[0]?.querySelector<HTMLAnchorElement>("a")?.click();
    await settle();
    expect(router.url).toBe("/changes/20261019-boletines-pdf?tab=progress");
    await router.navigateByUrl("/");
    await settle();
    expect(router.url).toBe("/");
    expect(search()?.value).toBe("pdf");
    expect(rows().map((item) => short(item.dataset.id))).toEqual(["boletines-pdf"]);
    expect(
      element.querySelector("[data-group] button[aria-pressed=true]")?.textContent?.trim(),
    ).toBe("Fase");
    expect(localStorage.getItem("specty.inbox.group")).toBe("phase");
  });

  it("opens a change on the tab its decision needs", async () => {
    const { row, router, settle } = await open();
    row("20261019-boletines-pdf")?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    await settle();
    expect(router.url).toBe("/changes/20261019-boletines-pdf?tab=progress");
  });

  it("updates live and explains a failing source, with retry", async () => {
    const { element, fixtures, settle, row } = await open();
    fixtures.approveSpec();
    await settle();
    expect(
      row("20261020-evolucion-trimestre")
        ?.querySelector("sp-phase-badge")
        ?.getAttribute("data-phase"),
    ).toBe("implementing");
    fixtures.toggleOutage();
    await settle();
    const alert = element.querySelector("sp-inbox [role=alert]");
    expect(text(alert)).toContain("No se pudieron leer los cambios");
    fixtures.toggleOutage();
    alert?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    await settle();
    expect(element.querySelector("sp-inbox [role=alert]")).toBeNull();
  });

  it("AC1: keeps listing the changes it showed when reading them again fails, under the alert", async () => {
    const { element, fixtures, settle, rows } = await open();
    const shown = rows().map((item) => item.dataset.id);
    expect(shown.length).toBeGreaterThan(0);
    fixtures.toggleOutage();
    await settle();
    expect(text(element.querySelector("sp-inbox [role=alert]"))).toContain(
      "No se pudieron leer los cambios",
    );
    expect(rows().map((item) => item.dataset.id)).toEqual(shown);
  });

  it("AC4: says «Feature» for a standalone standard change, in the Inbox and in its page", async () => {
    const { element, row, router, settle } = await open();
    const badge = row("20261020-evolucion-trimestre")?.querySelector("sp-kind-badge");
    expect(badge?.getAttribute("data-kind")).toBe("standard");
    expect(text(badge)).toBe("Feature");
    expect(text(row("20261021-modo-oscuro")?.querySelector("sp-kind-badge"))).toBe("Quick");
    await router.navigateByUrl("/changes/20261020-evolucion-trimestre");
    await settle();
    const heroBadge = element.querySelector("sp-change-page [data-hero] sp-kind-badge");
    expect(heroBadge?.getAttribute("data-kind")).toBe("standard");
    expect(text(heroBadge)).toBe("Feature");
  });

  it("AC1: heads the group with the epic's own row, its slices below and indented, in j/k order", async () => {
    // The epic waits for its review, like its two slices: all three in the same section.
    const { element, fixture, rows, press } = await open({ records: epicRecords("review") });
    const group = element.querySelector<HTMLElement>(
      '[data-section="decision"] [data-epic-group="20261015-panel"]',
    );
    const head = group?.querySelector<HTMLElement>("sp-inbox-row[data-epic-head]");
    expect(head?.dataset.id).toBe("20261015-panel");
    expect(head?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("review");
    expect(head?.querySelector("[data-started]")).not.toBeNull();
    expect(head?.querySelector("[data-phase-time]")).not.toBeNull();
    expect(head?.querySelector("a")?.getAttribute("href")).toBe("/changes/20261015-panel?tab=spec");
    expect(text(head?.querySelector("sp-button"))).toBe("Revisar spec");
    expect(text(head?.querySelector("sp-kind-badge"))).toBe("Épica");
    // No more «Total» nor the count: the epic's own times say it.
    expect(text(group)).not.toContain("Total");
    expect(group?.querySelector("[data-epic-duration], [data-epic-count]")).toBeNull();
    // Its slices go below the head, indented, and the head is not among them.
    const features = group?.querySelector<HTMLElement>("[data-epic-features]");
    expect(features?.contains(head ?? null)).toBe(false);
    expect(head?.compareDocumentPosition(features ?? document.body)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const slices = [...(features?.querySelectorAll<HTMLElement>("sp-inbox-row") ?? [])];
    expect(slices.map((item) => short(item.dataset.id))).toEqual([
      "asistencia-curso",
      "justificar-faltas",
    ]);
    // j/k stop at the head and then at each slice.
    expect(
      rows()
        .map((item) => short(item.dataset.id))
        .slice(0, 3),
    ).toEqual(["panel", "asistencia-curso", "justificar-faltas"]);
    expect(rows()[0]?.getAttribute("aria-current")).toBe("true");
    press("j");
    await fixture.whenStable();
    expect(rows()[1]?.getAttribute("aria-current")).toBe("true");
    press("j");
    await fixture.whenStable();
    expect(rows()[2]?.getAttribute("aria-current")).toBe("true");
  });

  it("AC1: heads each epic's section with the epic when grouping by epic", async () => {
    const { element, rows } = await open({ records: epicRecords("implementing"), group: "epic" });
    const section = element.querySelector<HTMLElement>('[data-section="epic:20261015-panel"]');
    const group = section?.querySelector<HTMLElement>('[data-epic-group="20261015-panel"]');
    expect(group?.querySelector<HTMLElement>("sp-inbox-row[data-epic-head]")?.dataset.id).toBe(
      "20261015-panel",
    );
    expect(
      [...(group?.querySelectorAll<HTMLElement>("[data-epic-features] sp-inbox-row") ?? [])].map(
        (item) => short(item.dataset.id),
      ),
    ).toEqual(["asistencia-curso", "justificar-faltas"]);
    expect(rows()[0]?.dataset.id).toBe("20261015-panel");
  });

  it("AC2: heads slices whose epic is in another section with its title, link and phase only", async () => {
    // The epic is in progress; its slices wait for the person.
    const { element, fixture, rows, row, press } = await open({
      records: epicRecords("implementing"),
    });
    const group = element.querySelector<HTMLElement>(
      '[data-section="decision"] [data-epic-group="20261015-panel"]',
    );
    expect(group?.querySelector("sp-inbox-row[data-epic-head]")).toBeNull();
    const header = group?.querySelector<HTMLElement>("[data-epic-header]");
    expect(header?.closest("sp-inbox-row")).toBeNull();
    const link = header?.querySelector("a");
    expect(text(link)).toBe("Panel académico");
    expect(link?.getAttribute("href")).toBe("/changes/20261015-panel?tab=progress");
    expect(header?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe(
      "implementing",
    );
    expect(header?.querySelector("[data-started], [data-phase-time], [data-took]")).toBeNull();
    expect(header?.querySelector("sp-button")).toBeNull();
    expect(text(group)).not.toContain("Total");
    expect(
      [...(group?.querySelectorAll<HTMLElement>("[data-epic-features] sp-inbox-row") ?? [])].map(
        (item) => short(item.dataset.id),
      ),
    ).toEqual(["asistencia-curso", "justificar-faltas"]);
    // j/k go from the first slice to the next, past the header.
    expect(rows()[0]?.dataset.id).toBe("20261018-asistencia-curso");
    press("j");
    await fixture.whenStable();
    expect(row("20261016-justificar-faltas")?.getAttribute("aria-current")).toBe("true");
    // In its own section, without its slices there, the epic is a plain row.
    const active = element.querySelector<HTMLElement>('[data-section="active"]');
    expect(active?.querySelector('sp-inbox-row[data-id="20261015-panel"]')).not.toBeNull();
    expect(active?.querySelector("[data-epic-group]")).toBeNull();
  });

  it("AC3: labels each slice with its id and title in the group, and with the epic in its page", async () => {
    const { row, element, router, settle } = await open({ records: epicRecords("implementing") });
    // The epic's Cortes section names C1, not C2.
    expect(text(row("20261018-asistencia-curso")?.querySelector("sp-kind-badge"))).toBe(
      "Feature · C1 · Asistencia por curso",
    );
    expect(text(row("20261016-justificar-faltas")?.querySelector("sp-kind-badge"))).toBe(
      "Feature · C2",
    );
    await router.navigateByUrl("/changes/20261016-justificar-faltas");
    await settle();
    const heroBadge = element.querySelector("sp-change-page [data-hero] sp-kind-badge");
    expect(heroBadge?.getAttribute("data-kind")).toBe("slice");
    expect(text(heroBadge)).toBe("Feature · C2 · Panel académico");
  });
});

/**
 * The sample project with an epic, «Panel académico», in `phase`, whose Cortes section names C1:
 * «Asistencia por curso» (C1) and «Justificar faltas» (C2) are its slices.
 */
function epicRecords(phase: "review" | "implementing"): readonly ChangeRecord[] {
  const records = sampleRecords(Date.now());
  const epicSpec = [
    "---\nkind: epic\n---\n\n# Panel académico\n\n## Objetivo\n\nSeguimiento.\n",
    "## Cortes\n\n- C1: Asistencia por curso\n  - ac: AC1\n",
  ].join("\n");
  const epicRecord: ChangeRecord = {
    spec: epicSpec,
    state: { ...(records[0] ?? failRecord()).state, id: "20261015-panel", kind: "epic", phase },
    phaseSince: new Date().toISOString(),
  };
  const slices: Readonly<Record<string, string>> = {
    "20261018-asistencia-curso": "C1",
    "20261016-justificar-faltas": "C2",
  };
  return [
    epicRecord,
    ...records.map((rec) => {
      const slice = slices[rec.state.id];
      if (slice === undefined) return rec;
      const frontmatter = `kind: standard\nepic: 20261015-panel\nslice: ${slice}`;
      return { ...rec, spec: rec.spec.replace("kind: standard", frontmatter) };
    }),
  ];
}

function failRecord(): never {
  throw new Error("missing fixture record");
}
