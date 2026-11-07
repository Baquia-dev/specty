// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  renderText,
  waitFolderGoneCard,
  waitHeartbeat,
  waitTimeoutCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("wait timeout card", () => {
  it("AC4: formats timeout message in both languages without blocking the state", () => {
    const card = waitTimeoutCard("20261031-saludo", 30, ES);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toContain("Tiempo de espera agotado");
    expect(renderText(card, "es")).toContain("30s");
    const english = waitTimeoutCard("20261031-saludo", 30, EN);
    expect(renderText(english, "en")).toContain("Wait timed out");
  });

  it("AC2, AC4: asks to remind the person and run `specty wait` again right away, in each tool's way", () => {
    const claude = waitTimeoutCard("20261031-saludo", 3600, { ...ES, tool: "claude-code" });
    expect(claude.next).toBe(
      "recuérdale a la persona la decisión pendiente y vuelve a ejecutar ya `specty wait` para esperar su decisión. Ejecútalo en segundo plano (`run_in_background: true`), que te avisa al terminar, y vuelve a ejecutarlo cada vez que se agote o se corte.",
    );
    expect(renderText(claude, "es")).not.toContain("cuando corresponda");
    expect(waitTimeoutCard("20261031-saludo", 3600, { ...EN, tool: "codex" }).next).toBe(
      "remind the person of the pending decision and run `specty wait` again right away to wait for their decision. If it is still running, poll its output until it ends, and run it again each time it times out or is cut off.",
    );
    expect(waitTimeoutCard("20261031-saludo", 3600, EN).next).toBe(
      "remind the person of the pending decision and run `specty wait` again right away to wait for their decision. Run it in the foreground and run it again each time it times out or is cut off.",
    );
    expect(waitTimeoutCard("20261031-saludo", 3600, { ...ES, tool: "gemini-cli" }).next).toBe(
      "recuérdale a la persona la decisión pendiente y vuelve a ejecutar ya `specty wait` para esperar su decisión. Ejecútalo en primer plano y vuelve a ejecutarlo cada vez que se agote o se corte.",
    );
  });

  it("AC4: in delegated mode, says the pending decision is the person's alone and asks to remind them and wait again", () => {
    const delegated = { delegated: true } as const;
    const claude = waitTimeoutCard("20261031-saludo", 3300, {
      ...ES,
      tool: "claude-code",
      ...delegated,
    });
    expect(claude.status).toBe("blocked");
    expect(renderText(claude, "es")).toContain("Tiempo de espera agotado (3300s)");
    expect(claude.next).toBe(
      "la decisión pendiente es solo de la persona, también en modo delegado: recuérdasela y vuelve a ejecutar ya `specty wait` para esperar su decisión. Ejecútalo en segundo plano (`run_in_background: true`), que te avisa al terminar, y vuelve a ejecutarlo cada vez que se agote o se corte.",
    );
    expect(waitTimeoutCard("20261031-saludo", 3300, { ...EN, ...delegated }).next).toBe(
      "the pending decision is the person's alone, in delegated mode too: remind them of it and run `specty wait` again right away to wait for their decision. Run it in the foreground and run it again each time it times out or is cut off.",
    );
    // Without delegated mode, the card stays as it was.
    expect(waitTimeoutCard("20261031-saludo", 3300, { ...ES, delegated: false }).next).toBe(
      waitTimeoutCard("20261031-saludo", 3300, ES).next,
    );
  });
});

describe("wait heartbeat", () => {
  it("AC4, AC5: in Gemini CLI, the line says the change and the minutes it has waited, in both languages", () => {
    expect(waitHeartbeat("20261031-saludo", 125, 3600, { ...ES, tool: "gemini-cli" })).toBe(
      "specty: sigue esperando la decisión de la persona en 20261031-saludo (2 de 60 min)…",
    );
    expect(waitHeartbeat("20261031-saludo", 125, 3600, { ...EN, tool: "gemini-cli" })).toBe(
      "specty: still waiting for the person's decision on 20261031-saludo (2 of 60 min)…",
    );
  });

  it("AC4: the other tools, and an unknown one, get no heartbeat line", () => {
    const others = [
      "claude-code",
      "cursor",
      "opencode",
      "antigravity",
      "codex",
      "windsurf",
      "copilot",
    ] as const;
    for (const tool of others) {
      expect(waitHeartbeat("20261031-saludo", 125, 3600, { ...ES, tool })).toBeUndefined();
    }
    expect(waitHeartbeat("20261031-saludo", 125, 3600, ES)).toBeUndefined();
  });
});

describe("wait folder gone card", () => {
  const ID = "20261031-saludo";
  const FOLDER = "/repo/.worktrees/20261031-saludo";
  const gone = (phase?: "done" | "cancelled" | "acceptance") => ({
    id: ID,
    folder: FOLDER,
    main: "/repo",
    ...(phase === undefined ? {} : { phase }),
  });

  it("says the person closed the change and asks to leave the folder that no longer exists, as a closing from inside does", () => {
    const card = waitFolderGoneCard(gone("done"), { ...ES, tool: "claude-code" });
    expect(card.status).toBe("ok");
    expect(card.header).toBe(`SPECTY · ${ID} · done`);
    expect(renderText(card, "es")).toContain(
      `La persona cerró ${ID} mientras esperabas, y su carpeta ${FOLDER} se eliminó.`,
    );
    expect(card.next).toBe(
      `${FOLDER} ya no existe: sal de ella (en Claude Code, \`ExitWorktree\`) y sigue en /repo; para otro cambio, \`specty new "<título>"\`.`,
    );
    const english = waitFolderGoneCard(gone("done"), EN);
    expect(renderText(english, "en")).toContain(
      `The person closed ${ID} while you waited, and its folder ${FOLDER} was removed.`,
    );
    expect(english.next).toBe(
      `${FOLDER} no longer exists: leave it (in Claude Code, \`ExitWorktree\`) and carry on in /repo; for another change, \`specty new "<title>"\`.`,
    );
  });

  it("says the person cancelled the change, with the same way out", () => {
    const card = waitFolderGoneCard(gone("cancelled"), ES);
    expect(card.header).toBe(`SPECTY · ${ID} · cancelled`);
    expect(renderText(card, "es")).toContain(
      `La persona canceló ${ID} mientras esperabas, y su carpeta ${FOLDER} se eliminó.`,
    );
    expect(card.next).toBe(waitFolderGoneCard(gone("done"), ES).next);
    expect(renderText(waitFolderGoneCard(gone("cancelled"), EN), "en")).toContain(
      `The person cancelled ${ID} while you waited, and its folder ${FOLDER} was removed.`,
    );
  });

  it("says the folder went with the change still open, and asks to bring it back with `specty restore` from the main folder", () => {
    for (const card of [
      waitFolderGoneCard(gone("acceptance"), ES),
      waitFolderGoneCard(gone(), ES),
    ]) {
      expect(card.status).toBe("ok");
      expect(renderText(card, "es")).toContain(
        `La carpeta ${FOLDER} de ${ID} se eliminó mientras esperabas, sin cerrar ni cancelar el cambio, que sigue en su rama.`,
      );
      expect(card.next).toBe(
        `${FOLDER} ya no existe: sal de ella (en Claude Code, \`ExitWorktree\`) y, en /repo, recupera la carpeta con \`specty restore ${ID}\` y sigue su salida, que dice cómo volver a ella.`,
      );
    }
    expect(waitFolderGoneCard(gone("acceptance"), ES).header).toBe(`SPECTY · ${ID} · acceptance`);
    const english = waitFolderGoneCard(gone("acceptance"), EN);
    expect(renderText(english, "en")).toContain(
      `Folder ${FOLDER} of ${ID} was removed while you waited, without closing or cancelling the change, which is still on its branch.`,
    );
    expect(english.next).toBe(
      `${FOLDER} no longer exists: leave it (in Claude Code, \`ExitWorktree\`) and, in /repo, bring the folder back with \`specty restore ${ID}\` and follow its output, which tells how to go back to it.`,
    );
  });
});
