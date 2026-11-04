// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { Toasts } from "../components/toast";
import { DERIVER } from "../data/changes-store";
import { FixtureData, sampleRecords } from "../data/fixtures";
import type { ChangeRecord } from "../data/records";
import { SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

const [ORPHAN = "", AWAY = ""] = sampleRecords(Date.now()).map((record) => record.state.id);
const FOLDER = `/repo/.worktrees/${AWAY}`;

/** The sample data, with ORPHAN held by nobody and AWAY's conversation outside its folder. */
@Injectable()
class Unheld extends FixtureData {
  override async changes(): Promise<readonly ChangeRecord[]> {
    return (await super.changes()).map((record) => {
      if (record.state.id === ORPHAN) return { ...record, orphan: true };
      if (record.state.id === AWAY)
        return { ...record, folder: FOLDER, away: { tool: "codex", ago: 4 } };
      return record;
    });
  }
}

async function open(url: string) {
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
      { provide: SpectyData, useClass: Unheld },
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
  return { element, settle, toasts };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

/** The Inbox row of change `id`. */
const rowOf = (element: HTMLElement, id: string) =>
  [...element.querySelectorAll("sp-inbox-row")].find(
    (row) => row.querySelector(`a[href^="/changes/${id}"]`) !== null,
  );

/** A clipboard that keeps what it is given, or refuses it. */
function clipboard(works = true) {
  const writeText = vi.fn((_text: string) =>
    works ? Promise.resolve() : Promise.reject(new Error("denied")),
  );
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

describe("a change no conversation holds, in the UI", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC2: its Inbox row says nobody holds it, or that its conversation left its folder", async () => {
    const { element } = await open("/");
    expect(text(rowOf(element, ORPHAN)?.querySelector("[data-unheld]"))).toBe(
      "Ninguna conversación lo lleva",
    );
    expect(text(rowOf(element, AWAY)?.querySelector("[data-unheld]"))).toBe(
      "Su conversación (codex) salió de su carpeta",
    );
    const marked = [...element.querySelectorAll("sp-inbox-row [data-unheld]")];
    expect(marked).toHaveLength(2);
  });

  it("AC3: its page says, above the tabs, how to resume it with each agent", async () => {
    const { element } = await open(`/changes/${AWAY}`);
    const panel = element.querySelector("sp-change-page sp-resume-hints");
    const tabs = element.querySelector("sp-change-page sp-tabs");
    expect(panel).not.toBeNull();
    expect(tabs).not.toBeNull();
    expect(
      (panel?.compareDocumentPosition(tabs as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(text(panel?.querySelector("[data-why]"))).toBe(
      "Su conversación (codex) salió de su carpeta hace 4 min.",
    );
    const hints = [...(panel?.querySelectorAll("[data-agent]") ?? [])].map(
      (hint) => `${text(hint.querySelector("[data-name]"))}: ${text(hint.querySelector("code"))}`,
    );
    expect(hints).toEqual([
      `Claude Code: cd "${FOLDER}" && claude`,
      `Codex: codex -C "${FOLDER}"`,
      `OpenCode: opencode "${FOLDER}"`,
      `Cursor: cursor "${FOLDER}"`,
      `Gemini CLI: cd "${FOLDER}" && gemini`,
      `Antigravity CLI: cd "${FOLDER}" && agy`,
    ]);
    expect(text(panel?.querySelector("[data-open-session]"))).toBe(
      `Desde una sesión ya abierta: en Claude Code, EnterWorktree con name: "${AWAY}"; en las demás, specty enter ${AWAY}.`,
    );
    expect(text(panel?.querySelector("[data-then]"))).toBe(
      "Ya en la carpeta, el agente sigue con specty next.",
    );
  });

  it("AC3: an orphan's page says nobody works in its folder, and a held change shows nothing", async () => {
    const orphan = await open(`/changes/${ORPHAN}`);
    expect(text(orphan.element.querySelector("sp-resume-hints [data-why]"))).toBe(
      "Ninguna conversación trabaja en su carpeta.",
    );
    const held = sampleRecords(Date.now())[2]?.state.id ?? "";
    const other = await open(`/changes/${held}`);
    expect(other.element.querySelector("sp-resume-hints")).toBeNull();
  });

  it("AC4: copies an order and says so, or says it could not", async () => {
    const writeText = clipboard();
    const { element, settle, toasts } = await open(`/changes/${AWAY}`);
    const copy = () =>
      element.querySelector<HTMLButtonElement>("sp-resume-hints [data-agent] sp-button button");
    copy()?.click();
    await settle();
    expect(writeText).toHaveBeenCalledWith(`cd "${FOLDER}" && claude`);
    expect(toasts()).toContain("Orden copiada.");
    clipboard(false);
    copy()?.click();
    await settle();
    expect(toasts()).toContain("No se pudo copiar la orden: cópiala a mano.");
  });
});
