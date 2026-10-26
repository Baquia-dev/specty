// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  checkStagedFailedLine,
  notBuiltPage,
  renderText,
  runRefusalCard,
  runStartedCard,
  uiApprovalRefusalCard,
  worktreeHookRefusal,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const HEADER = "SPECTY · 20261020-saludo · acceptance";

describe("the full verification started from the UI", () => {
  it("does not start without a change in acceptance, a command, or while it runs", () => {
    expect(renderText(runRefusalCard({ reason: "no-change", id: "x" }, "SPECTY", ES), "es")).toBe(
      "SPECTY\nNo hay ningún cambio x.\nSIGUIENTE: vuelve a cargar la UI.",
    );
    expect(runRefusalCard({ reason: "not-in-acceptance" }, HEADER, EN).blocks[0]?.lines).toEqual([
      "The full verification runs with the change in acceptance.",
    ]);
    expect(runRefusalCard({ reason: "no-full-verify" }, HEADER, ES).next).toBe(
      "añádela en .specty/config.yaml.",
    );
    expect(renderText(runRefusalCard({ reason: "running" }, HEADER, EN), "en")).toBe(
      `${HEADER}\nThe full verification of this change is already running.\nNEXT: wait for it to finish.`,
    );
  });

  it("says when it started", () => {
    const card = runStartedCard(HEADER, "pnpm check", ES);
    expect(card.status).toBe("ok");
    expect(renderText(card, "es")).toBe(
      `${HEADER}\nVerificación completa en marcha: \`pnpm check\`.\nSIGUIENTE: sigue su salida en la UI.`,
    );
  });
});

describe("an approval from the UI", () => {
  it("needs the current revision and its high-impact assumptions confirmed", () => {
    const stale = uiApprovalRefusalCard({ reason: "stale", current: 3, asked: 2 }, HEADER, ES);
    expect(renderText(stale, "es")).toBe(
      `${HEADER}\nLa revisión vigente es la 3, no la 2.\nSIGUIENTE: vuelve a cargarla antes de aprobar.`,
    );
    const open = uiApprovalRefusalCard({ reason: "unconfirmed", ids: ["A1", "A3"] }, HEADER, EN);
    expect(open.blocks[0]?.lines).toEqual([
      "High-impact assumptions are not confirmed yet: A1, A3.",
    ]);
    expect(open.next).toBe(
      "confirm them or, if one is wrong, reject it and ask the agent for changes.",
    );
  });

  it("is not possible when the UI is not built: the page says how to build it", () => {
    expect(notBuiltPage("es")).toBe(
      '<!doctype html><meta charset="utf-8"><title>Specty</title><p>La UI no está construida: ejecuta <code>pnpm --filter @baquia-dev/specty-ui build</code> y vuelve a cargar esta página. Los datos siguen en <code>/api/changes</code>.</p>',
    );
    expect(notBuiltPage("en")).toContain("<p>The UI is not built: run <code>");
  });
});

describe("the hooks", () => {
  it("say why a commit does not pass the checks", () => {
    expect(checkStagedFailedLine("es")).toBe("specty: el commit no pasa `specty check --staged`:");
    expect(checkStagedFailedLine("en")).toBe(
      "specty: the commit does not pass `specty check --staged`:",
    );
  });

  it("say why a worktree is not created or removed", () => {
    expect(worktreeHookRefusal({ reason: "no-repository", cwd: "/tmp" }, "es")).toBe(
      "/tmp no está en un repositorio de git.",
    );
    expect(worktreeHookRefusal({ reason: "invalid-name", name: "../x" }, "en")).toBe(
      'Invalid worktree name: "../x".',
    );
    expect(worktreeHookRefusal({ reason: "no-folder" }, "es")).toBe(
      "Falta la carpeta de la worktree.",
    );
    expect(
      worktreeHookRefusal({ reason: "change-folder", folder: "/w/x", command: "specty" }, "en"),
    ).toBe(
      "/w/x is a Specty change's folder: it stays while the change is open, and `specty close` removes it once the change is merged.",
    );
  });
});
