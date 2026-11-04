// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type Restored,
  renderText,
  restoredCard,
  restoreRefusalCard,
  type StatusEntry,
  statusCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const FOLDER = "/repo/.worktrees/20261104-saludo";

const RESTORED: Restored = {
  id: "20261104-saludo",
  phase: "implementing",
  branch: "specty/20261104-saludo",
  folder: FOLDER,
  repaired: false,
  copied: [".claude/settings.local.json"],
  byName: true,
};

/** The status line of `extra`'s change, in `ctx`'s language. */
const line = (extra: Partial<StatusEntry>, ctx: CardContext = ES): string | undefined =>
  renderText(
    statusCard(
      [
        {
          id: "a",
          kind: "standard",
          phase: "implementing",
          title: "A",
          waitingFor: "agent",
          current: false,
          pendingScope: [],
          ...extra,
        },
      ],
      ctx,
    ),
    ctx.lang,
  )
    .split("\n")
    .find((text) => text.includes("— A"))
    ?.trimStart();

describe("a change without its folder, in the status line", () => {
  it("AC1: is marked, with the command that brings its folder back", () => {
    expect(line({ lost: true })).toBe(
      "a · standard · implementing · espera al agente — A · sin carpeta: se recupera desde su rama con `specty restore a`",
    );
    expect(line({ lost: true }, EN)).toBe(
      "a · standard · implementing · waits for the agent — A · no folder: `specty restore a` brings it back from its branch",
    );
  });

  it("AC1: says that instead of who held it", () => {
    const text = line({ lost: true, holder: { tool: "claude-code", ago: 3 }, orphan: true });
    expect(text).toContain("sin carpeta");
    expect(text).not.toContain("lo lleva");
    expect(text).not.toContain("huérfano");
  });

  it("AC1: is in the card's data for `status --json`", () => {
    const [entry] = statusCard(
      [
        {
          id: "a",
          kind: "standard",
          phase: "review",
          title: "A",
          waitingFor: "human",
          current: false,
          pendingScope: [],
          lost: true,
        },
      ],
      ES,
    ).changes;
    expect(entry).toMatchObject({ id: "a", lost: true });
  });
});

describe("`specty restore`'s card", () => {
  it("AC2: says where the folder is, that uncommitted work does not come back, and how to enter", () => {
    const card = restoredCard(RESTORED, ES);
    expect(card.status).toBe("ok");
    const text = renderText(card, "es");
    expect(text).toContain("SPECTY · 20261104-saludo · implementing");
    expect(text).toContain(
      `Carpeta recuperada: 20261104-saludo (rama specty/20261104-saludo) en ${FOLDER}.`,
    );
    expect(text).toContain(
      "Lo que no estaba confirmado en la rama cuando se perdió la carpeta no vuelve.",
    );
    expect(text).toContain("HOOKS DEL AGENTE COPIADOS:\n  .claude/settings.local.json");
    expect(text).toContain(
      `SIGUIENTE: continúa en ${FOLDER}: cambia allí la carpeta de trabajo de tu sesión (en Claude Code, \`EnterWorktree\` con \`name: "20261104-saludo"\`; o abre allí un agente) y ejecuta \`specty next\``,
    );
  });

  it("AC2: is written in English too", () => {
    const text = renderText(restoredCard(RESTORED, EN), "en");
    expect(text).toContain(
      `Folder restored: 20261104-saludo (branch specty/20261104-saludo) in ${FOLDER}.`,
    );
    expect(text).toContain(
      "What was not committed on the branch when the folder was lost does not come back.",
    );
    expect(text).toContain(`NEXT: carry on in ${FOLDER}:`);
  });

  it("AC2: says how it was prepared, and puts a failed preparation first in the way on", () => {
    const ok = renderText(
      restoredCard(
        { ...RESTORED, prepared: { command: "pnpm install", ok: true, output: [] } },
        ES,
      ),
      "es",
    );
    expect(ok).toContain("Carpeta preparada con `pnpm install`.");
    const failed = renderText(
      restoredCard(
        { ...RESTORED, prepared: { command: "pnpm install", ok: false, output: ["ERR_X"] } },
        ES,
      ),
      "es",
    );
    expect(failed).toContain("FALLÓ `pnpm install`:\n  ERR_X");
    expect(failed).toContain(`SIGUIENTE: en ${FOLDER}, ejecuta \`pnpm install\`; después `);
  });

  it("AC2: says another agent enters it with `specty enter`", () => {
    const text = renderText(restoredCard({ ...RESTORED, agent: "codex" }, ES), "es");
    expect(text).toContain("ejecuta `specty enter 20261104-saludo`");
  });

  it("AC3: a folder git recognizes again after repairing it stays as it was", () => {
    const text = renderText(restoredCard({ ...RESTORED, repaired: true, copied: [] }, ES), "es");
    expect(text).toContain(
      `Git volvió a reconocer ${FOLDER} como la carpeta del cambio 20261104-saludo (rama specty/20261104-saludo): queda como estaba.`,
    );
    expect(text).not.toContain("no vuelve");
  });

  it("AC3: a folder in the way is left untouched, and the person moves it aside", () => {
    const card = restoreRefusalCard(
      { reason: "in-the-way", id: "20261104-saludo", folder: FOLDER },
      ES,
    );
    expect(card.status).toBe("blocked");
    const text = renderText(card, "es");
    expect(text).toContain(
      `En ${FOLDER} hay una carpeta que git no reconoce como la del cambio 20261104-saludo, y \`git worktree repair\` no la recuperó: Specty no la toca.`,
    );
    expect(text).toContain(
      `SIGUIENTE: pídele a la persona que aparte ${FOLDER} (que la mueva, o que la borre si no necesita sus archivos) y vuelve a ejecutar \`specty restore 20261104-saludo\`.`,
    );
    const english = renderText(
      restoreRefusalCard({ reason: "in-the-way", id: "20261104-saludo", folder: FOLDER }, EN),
      "en",
    );
    expect(english).toContain(
      `In ${FOLDER} there is a folder git does not recognize as change 20261104-saludo's, and \`git worktree repair\` did not bring it back: Specty does not touch it.`,
    );
  });

  it("AC4: a change with its folder, or an unknown id, has nothing to restore", () => {
    const folder = renderText(
      restoreRefusalCard({ reason: "has-folder", id: "20261104-saludo", folder: FOLDER }, ES),
      "es",
    );
    expect(folder).toContain(
      `El cambio 20261104-saludo tiene su carpeta en ${FOLDER}: no hay nada que recuperar.`,
    );
    const unknown = restoreRefusalCard({ reason: "unknown", id: "x" }, ES);
    expect(unknown.status).toBe("blocked");
    const text = renderText(unknown, "es");
    expect(text).toContain("No hay un cambio abierto sin carpeta con el id x.");
    expect(text).toContain("SIGUIENTE: revisa `specty status`, que lista los cambios sin carpeta.");
    expect(renderText(restoreRefusalCard({ reason: "unknown", id: "x" }, EN), "en")).toContain(
      "There is no open change without its folder with id x.",
    );
  });

  it("AC4: says what git answered when it could not bring the folder back", () => {
    const text = renderText(
      restoreRefusalCard({ reason: "git", id: "20261104-saludo", detail: "fatal: boom" }, ES),
      "es",
    );
    expect(text).toContain(
      "Git no pudo recrear la carpeta del cambio 20261104-saludo: fatal: boom",
    );
  });
});
