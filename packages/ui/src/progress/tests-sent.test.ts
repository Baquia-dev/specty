// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import type { DiffFile, DiffLine } from "../data/diff";
import { SpectyData } from "../data/records";
import { ServerData } from "../data/server";
import type { TestsView } from "../data/tests";
import { type CodeToken, type FileColors, HIGHLIGHT } from "../highlight/highlight";
import { TestsSent } from "./tests-sent";

const NOW = Date.parse("2026-10-28T10:05:00.000Z");
const ID = "20261028-justificantes";

const SENT: TestsView = {
  submittedAt: "2026-10-28T10:00:00.000Z",
  files: ["test/justificante_test.dart", "test/aviso_test.dart"],
  red: [
    { cmd: "flutter test", exit: 1 },
    { cmd: "flutter test integration_test", exit: null },
  ],
};

const CODE = "void main() {\n  test('AC1: guarda el justificante', () {});\n}\n";

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

/** A highlighter that paints every line as a keyword, so its colors can be seen. */
const keywords = (file: DiffFile): Promise<FileColors> =>
  Promise.resolve(
    new Map(
      file.hunks.flatMap((hunk) =>
        hunk.lines.map((line): [DiffLine, readonly CodeToken[]] => [
          line,
          [{ text: line.text, color: "var(--color-code-keyword)" }],
        ]),
      ),
    ),
  );

async function render(lang = "es", tests: TestsView = SENT) {
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SpectyData, useClass: ServerData },
      { provide: HIGHLIGHT, useValue: keywords },
    ],
  });
  const fixture = TestBed.createComponent(TestsSent);
  fixture.componentRef.setInput("tests", tests);
  fixture.componentRef.setInput("now", NOW);
  fixture.componentRef.setInput("change", ID);
  const settle = async () => {
    for (let round = 0; round < 10; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  return { fixture, element, settle };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

/** The rows of the tests sent, and the «Ver código» of each. */
const rowsOf = (element: HTMLElement) => [...element.querySelectorAll("[data-test]")];
const toggleOf = (row: Element | undefined) =>
  row?.querySelector<HTMLButtonElement>("[data-test-code-toggle]") ?? undefined;

describe("TestsSent", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it("AC2: lists each new test by its path, each failing command with its exit and what approving means", async () => {
    serving({});
    const { element } = await render();
    expect(text(element.querySelector("h2"))).toBe("Tests por aprobar");
    expect(text(element.querySelector("[data-sent]"))).toBe(
      "El agente los envió hace 5 min. Fallan, como deben antes del código.",
    );
    expect(rowsOf(element).map((row) => text(row.querySelector("code")))).toEqual([
      "test/justificante_test.dart",
      "test/aviso_test.dart",
    ]);
    expect([...element.querySelectorAll("[data-red]")].map(text)).toEqual([
      "flutter test falla · salida 1",
      "flutter test integration_test no terminó",
    ]);
    expect(text(element.querySelector("[data-meaning]"))).toBe(
      "Al aprobarlos quedan bloqueados: el agente ya no puede cambiarlos ni borrarlos sin que lo decidas, y escribe el código que los pone en verde.",
    );
    expect(element.querySelector("[data-writing]")).toBeNull();
  });

  it("AC2: while the agent writes them, says so and lists nothing", async () => {
    serving({});
    const { element } = await render("es", { files: [], red: [] });
    expect(text(element.querySelector("h2"))).toBe("Tests");
    expect(text(element.querySelector("[data-writing]"))).toBe(
      "El agente escribe los tests de los criterios, antes del código. Cuando los envíe, aquí verás cada test nuevo y la verificación que falla.",
    );
    expect(element.querySelectorAll("[data-test], [data-red], [data-meaning]")).toHaveLength(0);
  });

  it("AC1: «Ver código» unfolds a test's code from the server, numbered and highlighted, and folds it again", async () => {
    const fetched = serving({ "test/justificante_test.dart": CODE });
    const { element, settle } = await render();
    const [first, second] = rowsOf(element);
    const toggle = toggleOf(first);
    expect(text(toggle)).toBe("Ver código");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    // Folded, it asks for nothing.
    expect(element.querySelector("[data-test-code]")).toBeNull();
    expect(fetched).not.toHaveBeenCalled();

    toggle?.click();
    await settle();
    expect(fetched).toHaveBeenCalledWith(
      `/api/changes/${ID}/test?path=test%2Fjustificante_test.dart`,
    );
    const lines = [...(first?.querySelectorAll("[data-test-code] [data-line]") ?? [])];
    expect(lines.map((line) => text(line.querySelector("[data-number]")))).toEqual(["1", "2", "3"]);
    expect(lines.map((line) => line.querySelector("[data-code]")?.textContent)).toEqual([
      "void main() {",
      "  test('AC1: guarda el justificante', () {});",
      "}",
    ]);
    const painted = [...(first?.querySelectorAll<HTMLElement>("[data-code] span") ?? [])];
    expect(painted.map((span) => span.style.color)).toEqual([
      "var(--color-code-keyword)",
      "var(--color-code-keyword)",
      "var(--color-code-keyword)",
    ]);
    expect(text(toggle)).toBe("Ocultar código");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    // The other test stays folded.
    expect(second?.querySelector("[data-test-code]")).toBeNull();

    toggle?.click();
    await settle();
    expect(first?.querySelector("[data-test-code]")).toBeNull();
    expect(text(toggle)).toBe("Ver código");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  });

  it("AC3: says in the row that it cannot show a code the server does not give, and the section stays", async () => {
    serving({});
    const { element, settle } = await render();
    const [first] = rowsOf(element);
    toggleOf(first)?.click();
    await settle();
    expect(first?.querySelector("[data-test-code]")).toBeNull();
    expect(text(first?.querySelector("[data-test-code-message]"))).toBe(
      "No se puede mostrar el código de este test: no es un test del cambio o no se pudo leer.",
    );
    expect(rowsOf(element)).toHaveLength(2);
    expect(element.querySelectorAll("[data-red]")).toHaveLength(2);
    expect(element.querySelector("[data-meaning]")).not.toBeNull();
  });

  it("AC4: says it in English", async () => {
    serving({ "test/justificante_test.dart": CODE });
    const { element, settle } = await render("en");
    expect(text(element.querySelector("h2"))).toBe("Tests to approve");
    expect([...element.querySelectorAll("[data-red]")].map(text)).toEqual([
      "flutter test fails · exit 1",
      "flutter test integration_test did not finish",
    ]);
    const [first, second] = rowsOf(element);
    expect(text(toggleOf(first))).toBe("Show code");
    toggleOf(first)?.click();
    toggleOf(second)?.click();
    await settle();
    expect(text(toggleOf(first))).toBe("Hide code");
    expect(first?.querySelectorAll("[data-test-code] [data-line]")).toHaveLength(3);
    expect(text(second?.querySelector("[data-test-code-message]"))).toBe(
      "This test's code cannot be shown: it is not a test of the change, or it could not be read.",
    );
  });
});
