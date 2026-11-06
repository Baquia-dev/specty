// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FixtureData } from "../data/fixtures";
import type { TaskScopeRequest } from "../data/progress";
import { SpectyData } from "../data/records";
import { HIGHLIGHT } from "../highlight/highlight";
import { ScopeRequest } from "./scope-request";

const TEST = "test/sesion_test.dart";

@Component({
  imports: [ScopeRequest],
  template: `<sp-scope-request change="20261021-login-google" task="T2" [request]="request()" />`,
})
class Host {
  readonly request = signal<TaskScopeRequest>({
    id: "S2",
    paths: [TEST, "lib/auth/session.dart"],
    reason: "El test esperaba el mensaje antiguo.",
    unlocks: [TEST],
  });
}

async function render() {
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: SpectyData, useClass: FixtureData }] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return { element, fixture, host: fixture.componentInstance };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("ScopeRequest", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC2: a request to unlock an approved test says so, marks it and says what approving means", async () => {
    const { element } = await render();
    expect(text(element.querySelector("[data-heading]"))).toBe("S2 · Desbloquear un test aprobado");
    expect([...element.querySelectorAll("[data-unlock]")].map(text)).toEqual(["(test aprobado)"]);
    expect(text(element.querySelector("[data-means]"))).toBe(
      "Si la apruebas, T2 podrá cambiar este test aprobado y vuelve a bloquearse al terminarla. Solo lo decides tú: el agente no puede aprobarlo, ni en modo delegado. Si la rechazas, el agente sigue sin él y lee tu motivo.",
    );
  });

  it("keeps a plain widening as it was", async () => {
    const { element, fixture, host } = await render();
    host.request.set({ id: "S1", paths: ["lib/app.dart"], reason: "La firma." });
    await fixture.whenStable();
    expect(text(element.querySelector("[data-heading]"))).toBe("S1 · Solicitud de alcance");
    expect(element.querySelector("[data-unlock]")).toBeNull();
    expect(text(element.querySelector("[data-means]"))).toBe(
      "Si la apruebas, T2 podrá tocarlo y entra en su alcance. Si la rechazas, el agente sigue sin él y lee tu motivo.",
    );
  });
});

const GIT_PATCH = [
  `diff --git a/${TEST} b/${TEST}`,
  "index 1a2b3c4..5d6e7f8 100644",
  `--- a/${TEST}`,
  `+++ b/${TEST}`,
  "@@ -1,3 +1,3 @@",
  " void main() {",
  "-  expect(aviso, 'Sesión caducada');",
  "+  expect(aviso, 'Tu sesión caducó');",
  " }",
  "",
].join("\n");

/** As an agent writes it by hand: no `diff --git`, and counts that leave out the last line. */
const HAND_PATCH = [
  `--- a/${TEST}`,
  `+++ b/${TEST}`,
  "@@ -1,2 +1,2 @@",
  " void main() {",
  "-  expect(aviso, 'Sesión caducada');",
  "+  expect(aviso, 'Tu sesión caducó');",
  " }",
  "",
].join("\n");

/** The same, to remove the test: `+++ /dev/null`, and a count of one line for three. */
const HAND_DELETION = [
  `--- a/${TEST}`,
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-void main() {",
  "-  expect(aviso, 'Sesión caducada');",
  "-}",
  "",
].join("\n");

const EVIDENCE = [
  {
    path: "lib/auth/session.dart",
    from: 12,
    to: 13,
    text: "  // El aviso nuevo, según AC2.\n  static const aviso = 'Tu sesión caducó';",
  },
  { path: "test/login_test.dart", from: 4, to: 4, text: "  expect(aviso, 'Tu sesión caducó');" },
];

const UNLOCK = {
  id: "S2",
  paths: [TEST],
  reason: "El aviso cambió de texto en la spec.",
  unlocks: [TEST],
  patch: GIT_PATCH,
  evidence: EVIDENCE,
};

/** The request alone, with its inputs given one by one, as the tab gives them. */
async function renderAlone(request: unknown, lang = "es") {
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SpectyData, useClass: FixtureData },
      { provide: HIGHLIGHT, useValue: () => Promise.resolve(undefined) },
    ],
  });
  const fixture = TestBed.createComponent(ScopeRequest);
  fixture.componentRef.setInput("change", "20261021-login-google");
  fixture.componentRef.setInput("task", "T2");
  fixture.componentRef.setInput("request", request);
  for (let round = 0; round < 10; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  const element: HTMLElement = fixture.nativeElement;
  return element;
}

const patchLines = (element: HTMLElement) => [
  ...element.querySelectorAll("[data-unlock-patch] [data-line]"),
];

describe("ScopeRequest, the detail of an unlock", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: shows, beside Approve and Reject, the reason, the patch as a diff and each piece of evidence with its lines", async () => {
    const element = await renderAlone(UNLOCK);
    const group = element.querySelector("[data-scope-request]");
    expect(text(group)).toContain("«El aviso cambió de texto en la spec.»");
    expect(group?.querySelector("[data-unlock-detail]")).not.toBeNull();
    expect([...element.querySelectorAll("[data-unlock-heading]")].map(text)).toEqual([
      "El cambio al test",
      "El código que lo sustenta",
    ]);
    // The patch, in the diff viewer: its file and each line by its kind.
    const files = [...element.querySelectorAll("[data-unlock-patch] [data-file]")];
    expect(files.map((file) => file.getAttribute("data-file"))).toEqual([TEST]);
    expect(patchLines(element).map((line) => line.getAttribute("data-line"))).toEqual([
      "context",
      "removed",
      "added",
      "context",
    ]);
    expect(
      patchLines(element).map((line) => line.querySelector("[data-code]")?.textContent),
    ).toEqual([
      "void main() {",
      "Quitada:   expect(aviso, 'Sesión caducada');",
      "Añadida:   expect(aviso, 'Tu sesión caducó');",
      "}",
    ]);
    // Each piece of evidence: where it is, and its code numbered as in its file.
    const pieces = [...element.querySelectorAll("[data-evidence]")];
    expect(pieces.map((piece) => text(piece.querySelector("[data-evidence-where]")))).toEqual([
      "lib/auth/session.dart:12-13",
      "test/login_test.dart:4-4",
    ]);
    const first = [...(pieces[0]?.querySelectorAll("[data-line]") ?? [])];
    expect(first.map((line) => text(line.querySelector("[data-number]")))).toEqual(["12", "13"]);
    expect(first.map((line) => line.querySelector("[data-code]")?.textContent)).toEqual([
      "  // El aviso nuevo, según AC2.",
      "  static const aviso = 'Tu sesión caducó';",
    ]);
    expect(
      [...(pieces[1]?.querySelectorAll("[data-number]") ?? [])].map((number) => text(number)),
    ).toEqual(["4"]);
    // The decision is still there, under the detail.
    expect([...(group?.querySelectorAll("sp-button") ?? [])].map((button) => text(button))).toEqual(
      ["Aprobar", "Rechazar…"],
    );
  });

  it("AC2: reads a patch written by hand, without «diff --git» and with wrong counts, as git apply --recount did", async () => {
    const element = await renderAlone({ ...UNLOCK, patch: HAND_PATCH });
    const files = [...element.querySelectorAll("[data-unlock-patch] [data-file]")];
    expect(files.map((file) => file.getAttribute("data-file"))).toEqual([TEST]);
    expect(text(element.querySelector("[data-unlock-patch] [data-hunk] [aria-hidden]"))).toBe(
      "@@ -1,3 +1,3 @@",
    );
    expect(patchLines(element).map((line) => line.getAttribute("data-line"))).toEqual([
      "context",
      "removed",
      "added",
      "context",
    ]);
    expect(patchLines(element).at(-1)?.querySelector("[data-code]")?.textContent).toBe("}");
    // One that removes the test shows it deleted, with all its lines.
    const deleting = await renderAlone({ ...UNLOCK, patch: HAND_DELETION });
    expect(
      [...deleting.querySelectorAll("[data-unlock-patch] [data-file]")].map((file) =>
        file.getAttribute("data-file"),
      ),
    ).toEqual([TEST]);
    expect(text(deleting.querySelector("[data-unlock-patch] [data-status]"))).toBe("Borrado");
    expect(patchLines(deleting).map((line) => line.getAttribute("data-line"))).toEqual([
      "removed",
      "removed",
      "removed",
    ]);
  });

  it("AC4: a request without a patch or evidence, from an older CLI, shows as it did", async () => {
    const { patch: _patch, evidence: _evidence, ...older } = UNLOCK;
    const element = await renderAlone(older);
    expect(text(element.querySelector("[data-heading]"))).toBe("S2 · Desbloquear un test aprobado");
    expect(text(element.querySelector("[data-scope-request]"))).toContain(
      "«El aviso cambió de texto en la spec.»",
    );
    expect(element.querySelector("[data-unlock-detail]")).toBeNull();
    expect(element.querySelector("[data-unlock-heading]")).toBeNull();
  });

  it("AC5: says it in English", async () => {
    const element = await renderAlone(UNLOCK, "en");
    expect([...element.querySelectorAll("[data-unlock-heading]")].map(text)).toEqual([
      "The change to the test",
      "The code that supports it",
    ]);
    expect(patchLines(element)[1]?.querySelector("[data-code]")?.textContent).toBe(
      "Removed:   expect(aviso, 'Sesión caducada');",
    );
  });
});
