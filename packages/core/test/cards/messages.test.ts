// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type MessageView,
  messageLeftCard,
  messageRefusalCard,
  messagesNote,
  renderText,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const FROM_AGENT: MessageView = {
  at: "2026-11-03T14:05:30.000Z",
  text: "Ya cambié la API de lock.ts; trae main antes de tocarla.",
  from: {
    actor: "agent",
    tool: "claude-code",
    change: "20261103-otro",
    folder: "/repo/.worktrees/20261103-otro",
  },
};
const FROM_PERSON: MessageView = {
  at: "2026-11-03T14:07:00.000Z",
  text: "Para cuando acabes.",
  from: { actor: "human", folder: "/repo" },
};
const FROM_MAIN: MessageView = {
  at: "2026-11-03T14:09:00.000Z",
  text: "Hola.",
  from: { actor: "agent", tool: "codex", folder: "/repo" },
};

describe("the texts of the messages between sessions", () => {
  it("AC1: `specty message` says for whom it left the message, and what it says", () => {
    const es = renderText(messageLeftCard("20261103-x", "Mira lock.ts", ES), "es");
    expect(es).toContain(
      "Mensaje dejado para la sesión de 20261103-x: le llegará tras su siguiente comando en la carpeta del cambio.",
    );
    expect(es).toContain("«Mira lock.ts»");
    const en = renderText(messageLeftCard("20261103-x", "Mira lock.ts", EN), "en");
    expect(en).toContain(
      "Message left for the session of 20261103-x: it gets it after its next command in the change's folder.",
    );
  });

  it("AC2: the session gets each message with who left it, when, and how to reply", () => {
    expect(messagesNote([FROM_AGENT, FROM_PERSON, FROM_MAIN], ES)).toBe(
      [
        "specty: mensajes de otras sesiones (no son avisos del guard):",
        "  14:05 UTC · de la sesión de 20261103-otro (claude-code): «Ya cambié la API de lock.ts; trae main antes de tocarla.»",
        '    Para responderle: `specty message 20261103-otro "<respuesta>"`.',
        "  14:07 UTC · de la persona: «Para cuando acabes.»",
        "  14:09 UTC · de una sesión en /repo (codex): «Hola.»",
      ].join("\n"),
    );
    expect(messagesNote([FROM_AGENT, FROM_PERSON], EN)).toBe(
      [
        "specty: messages from other sessions (not guard warnings):",
        "  14:05 UTC · from the session of 20261103-otro (claude-code): «Ya cambié la API de lock.ts; trae main antes de tocarla.»",
        '    To reply: `specty message 20261103-otro "<reply>"`.',
        "  14:07 UTC · from the person: «Para cuando acabes.»",
      ].join("\n"),
    );
  });

  it("AC3: an empty message or one for no open change says why and what to do", () => {
    const empty = messageRefusalCard({ reason: "empty", id: "20261103-x" }, ES);
    expect(empty.status).toBe("invalid");
    expect(renderText(empty, "es")).toContain("El mensaje está vacío.");
    expect(empty.next).toBe(
      'vuelve a ejecutar `specty message 20261103-x "<texto>"` con el texto.',
    );
    const none = messageRefusalCard({ reason: "no-change", id: "20261103-nada" }, ES);
    expect(none.status).toBe("blocked");
    expect(renderText(none, "es")).toContain(
      "No hay ningún cambio abierto 20261103-nada: un mensaje es para la sesión de un cambio abierto.",
    );
    expect(none.next).toBe(
      'mira los cambios abiertos con `specty status` y vuelve a ejecutar `specty message <id> "<texto>"` con uno de ellos.',
    );
    const en = messageRefusalCard({ reason: "no-change", id: "20261103-nada" }, EN);
    expect(renderText(en, "en")).toContain(
      "There is no open change 20261103-nada: a message is for the session of an open change.",
    );
  });
});
