// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import type { LockedTestView } from "../data/locks";
import { SpectyData } from "../data/records";
import { ServerData } from "../data/server";
import { HIGHLIGHT } from "../highlight/highlight";
import { LockedTests } from "./locked-tests";

const ID = "20261028-sesiones";

const LOCKED: readonly LockedTestView[] = [
  { path: "test/login_test.dart", unlocks: [{ request: "S1", task: "T1" }] },
  {
    path: "test/sesion_test.dart",
    unlockedFor: "T2",
    unlocks: [
      { request: "S1", task: "T1" },
      { request: "S3", task: "T2" },
    ],
  },
  { path: "test/aviso_test.dart", unlocks: [] },
];

const LOGIN = "void main() {\n  test('AC1: entra con su clave', () {});\n}\n";

/** `fetch` as the local server answers: the code of each test it has, and 404 for any other. */
function serving(codes: Readonly<Record<string, string>>) {
  const fetched = vi.fn((url: string) => {
    const asked = new URL(url, "http://localhost").searchParams.get("path") ?? "";
    const code = codes[asked];
    return Promise.resolve(
      code === undefined
        ? new Response('{"error":"not found"}', { status: 404 })
        : new Response(code, { status: 200 }),
    );
  });
  vi.stubGlobal("fetch", fetched);
  return fetched;
}

async function render(lang = "es", tests: unknown = LOCKED) {
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SpectyData, useClass: ServerData },
      { provide: HIGHLIGHT, useValue: () => Promise.resolve(undefined) },
    ],
  });
  const fixture = TestBed.createComponent(LockedTests);
  fixture.componentRef.setInput("tests", tests);
  fixture.componentRef.setInput("change", ID);
  const settle = async () => {
    for (let round = 0; round < 10; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  return { element, settle };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

const rowsOf = (element: HTMLElement) => [...element.querySelectorAll("[data-locked]")];
const toggleOf = (row: Element | undefined) =>
  row?.querySelector<HTMLButtonElement>("[data-test-code-toggle]") ?? undefined;

describe("LockedTests", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it("AC1: lists each locked test by its path, the one unlocked for the task in progress and the unlocks so far", async () => {
    serving({});
    const { element } = await render();
    expect(text(element.querySelector("h2"))).toBe("Tests bloqueados");
    expect(text(element.querySelector("[data-meta]"))).toBe("3");
    const rows = rowsOf(element);
    expect(rows.map((row) => text(row.querySelector("code")))).toEqual([
      "test/login_test.dart",
      "test/sesion_test.dart",
      "test/aviso_test.dart",
    ]);
    expect(rows.map((row) => text(row.querySelector("[data-state]")))).toEqual([
      "Bloqueado · se desbloqueó con S1 para T1",
      "Desbloqueado para T2: vuelve a bloquearse al terminarla · se desbloqueó con S1 para T1 y con S3 para T2",
      "Bloqueado",
    ]);
    expect(rows.map((row) => row.hasAttribute("data-open"))).toEqual([false, true, false]);
  });

  it("AC2: each locked test has «Ver código», which unfolds its code from the change's server", async () => {
    const fetched = serving({ "test/login_test.dart": LOGIN });
    const { element, settle } = await render();
    const rows = rowsOf(element);
    expect(rows.map((row) => text(toggleOf(row)))).toEqual([
      "Ver código",
      "Ver código",
      "Ver código",
    ]);
    expect(fetched).not.toHaveBeenCalled();
    toggleOf(rows[0])?.click();
    await settle();
    expect(fetched).toHaveBeenCalledWith(`/api/changes/${ID}/test?path=test%2Flogin_test.dart`);
    const lines = [...(rows[0]?.querySelectorAll("[data-test-code] [data-line]") ?? [])];
    expect(lines.map((line) => text(line.querySelector("[data-number]")))).toEqual(["1", "2", "3"]);
    expect(lines.map((line) => line.querySelector("[data-code]")?.textContent)).toEqual([
      "void main() {",
      "  test('AC1: entra con su clave', () {});",
      "}",
    ]);
    expect(text(toggleOf(rows[0]))).toBe("Ocultar código");
    // Its state still shows, and the others stay folded.
    expect(text(rows[0]?.querySelector("[data-state]"))).toBe(
      "Bloqueado · se desbloqueó con S1 para T1",
    );
    expect(rows[1]?.querySelector("[data-test-code]")).toBeNull();
    // A test the server cannot give says so in its own row.
    toggleOf(rows[2])?.click();
    await settle();
    expect(text(rows[2]?.querySelector("[data-test-code-message]"))).toBe(
      "No se puede mostrar el código de este test: no es un test del cambio o no se pudo leer.",
    );
  });

  it("AC4: says it in English", async () => {
    serving({ "test/login_test.dart": LOGIN });
    const { element, settle } = await render("en");
    expect(text(element.querySelector("h2"))).toBe("Locked tests");
    expect(text(element.querySelectorAll("[data-state]")[1])).toBe(
      "Unlocked for T2: it locks again once that task is done · unlocked with S1 for T1 and with S3 for T2",
    );
    const rows = rowsOf(element);
    expect(text(toggleOf(rows[0]))).toBe("Show code");
    toggleOf(rows[0])?.click();
    await settle();
    expect(text(toggleOf(rows[0]))).toBe("Hide code");
    expect(rows[0]?.querySelectorAll("[data-test-code] [data-line]")).toHaveLength(3);
  });

  it("AC2, AC3: wraps each request and task sigla in data-item-ref and shows its tooltip on hover", async () => {
    serving({});
    const { element } = await render("es");
    const refs = [...element.querySelectorAll<HTMLElement>("[data-state] [data-item-ref]")];
    expect(refs.map((ref) => ref.dataset.itemRef)).toEqual([
      "S1",
      "T1",
      "T2",
      "S1",
      "T1",
      "S3",
      "T2",
    ]);
    refs[0]?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    expect(
      document.querySelector(".cdk-overlay-container [data-tooltip]")?.textContent?.trim(),
    ).toBe("Solicitud de alcance S1");
    refs[2]?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    expect(
      document.querySelector(".cdk-overlay-container [data-tooltip]")?.textContent?.trim(),
    ).toBe("Tarea T2");
  });
});

const PATCH = [
  "diff --git a/test/sesion_test.dart b/test/sesion_test.dart",
  "--- a/test/sesion_test.dart",
  "+++ b/test/sesion_test.dart",
  "@@ -2,1 +2,1 @@",
  "-  expect(aviso, 'Sesión caducada');",
  "+  expect(aviso, 'Tu sesión caducó');",
  "",
].join("\n");

/** A test unlocked three times: by an older CLI (its reason only), with the detail, and with nothing. */
const DETAILED = [
  {
    path: "test/sesion_test.dart",
    unlockedFor: "T2",
    unlocks: [
      { request: "S1", task: "T1", reason: "Un motivo de un CLI anterior." },
      {
        request: "S3",
        task: "T2",
        reason: "El aviso cambió de texto.",
        patch: PATCH,
        evidence: [
          {
            path: "lib/auth/session.dart",
            from: 7,
            to: 8,
            text: "  // AC2\n  aviso = 'Tu sesión caducó';",
          },
        ],
      },
      { request: "S4", task: "T2" },
    ],
  },
];

const unlockToggles = (element: HTMLElement) => [
  ...element.querySelectorAll<HTMLButtonElement>("[data-unlock-toggle]"),
];

describe("LockedTests, the detail of each unlock", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it("AC3: «Ver el desbloqueo» unfolds the agent's reason, the approved patch and the evidence, and folds them again", async () => {
    serving({});
    const { element, settle } = await render("es", DETAILED);
    const toggles = unlockToggles(element);
    expect(toggles.map((toggle) => text(toggle))).toEqual([
      "Ver el desbloqueo S1",
      "Ver el desbloqueo S3",
    ]);
    expect(toggles.map((toggle) => toggle.getAttribute("aria-expanded"))).toEqual([
      "false",
      "false",
    ]);
    expect(element.querySelector("[data-unlock-of]")).toBeNull();
    toggles[1]?.click();
    await settle();
    const opened = element.querySelector('[data-unlock-of="S3"]');
    expect(text(opened?.querySelector("[data-unlock-reason]"))).toBe(
      "Motivo del agente: «El aviso cambió de texto.»",
    );
    const lines = [...(opened?.querySelectorAll("[data-unlock-patch] [data-line]") ?? [])];
    expect(lines.map((line) => line.getAttribute("data-line"))).toEqual(["removed", "added"]);
    expect(text(opened?.querySelector("[data-evidence-where]"))).toBe("lib/auth/session.dart:7-8");
    expect(
      [...(opened?.querySelectorAll("[data-evidence] [data-number]") ?? [])].map((n) => text(n)),
    ).toEqual(["7", "8"]);
    expect(text(unlockToggles(element)[1])).toBe("Ocultar el desbloqueo S3");
    expect(unlockToggles(element)[1]?.getAttribute("aria-expanded")).toBe("true");
    // The other unlock stays folded.
    expect(element.querySelector('[data-unlock-of="S1"]')).toBeNull();
    unlockToggles(element)[1]?.click();
    await settle();
    expect(element.querySelector("[data-unlock-of]")).toBeNull();
    expect(text(unlockToggles(element)[1])).toBe("Ver el desbloqueo S3");
  });

  it("AC4: an unlock without a patch or evidence gives only its reason, and one without a reason has no button", async () => {
    serving({});
    const { element, settle } = await render("es", DETAILED);
    expect(unlockToggles(element).map((toggle) => text(toggle))).not.toContain(
      "Ver el desbloqueo S4",
    );
    unlockToggles(element)[0]?.click();
    await settle();
    const opened = element.querySelector('[data-unlock-of="S1"]');
    expect(text(opened?.querySelector("[data-unlock-reason]"))).toBe(
      "Motivo del agente: «Un motivo de un CLI anterior.»",
    );
    expect(opened?.querySelector("[data-unlock-detail]")).toBeNull();
    // The tests without any unlock detail have no button at all.
    const plain = await render("es");
    expect(unlockToggles(plain.element)).toEqual([]);
  });

  it("AC5: says the detail in English", async () => {
    serving({});
    const { element, settle } = await render("en", DETAILED);
    expect(unlockToggles(element).map((toggle) => text(toggle))).toEqual([
      "Show unlock S1",
      "Show unlock S3",
    ]);
    unlockToggles(element)[1]?.click();
    await settle();
    expect(text(unlockToggles(element)[1])).toBe("Hide unlock S3");
    expect(text(element.querySelector("[data-unlock-reason]"))).toBe(
      "The agent's reason: «El aviso cambió de texto.»",
    );
    expect([...element.querySelectorAll("[data-unlock-heading]")].map(text)).toEqual([
      "The change to the test",
      "The code that supports it",
    ]);
  });
});
