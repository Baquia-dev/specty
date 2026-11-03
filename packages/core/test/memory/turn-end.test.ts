// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, memoryStopReason, pendingInMessage } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("the pending items a message lists", () => {
  it("AC1: are the bullets under a pending heading, in any of its forms", () => {
    expect(
      pendingInMessage(
        "Hecho.\n\n**Qué queda pendiente**\n- Revisar el README.\n- P4 sigue abierta.\n\nGracias.",
      ),
    ).toEqual(["Revisar el README.", "P4 sigue abierta."]);
    expect(pendingInMessage("### Pendientes\n\n1. Uno\n2. Dos\n")).toEqual(["Uno", "Dos"]);
    expect(
      pendingInMessage("Next steps:\n* Ship it\n  - a nested detail\n* Tell the team"),
    ).toEqual(["Ship it", "Tell the team"]);
    expect(pendingInMessage("Lo que queda:\n• Algo")).toEqual(["Algo"]);
    expect(pendingInMessage("## Follow-ups\n- A\n\n- B\nFin\n- C")).toEqual(["A", "B"]);
    expect(pendingInMessage("Pending:\n- One\n\nTO DO\n- Two")).toEqual(["One", "Two"]);
  });

  it("AC3: are none without a pending heading, or for bullets under another one", () => {
    expect(pendingInMessage("**Qué cambió**\n- Uno\n- Dos")).toEqual([]);
    expect(pendingInMessage("Queda pendiente revisar el README.\n- Algo")).toEqual([]);
    expect(pendingInMessage("Pendientes: ninguno.")).toEqual([]);
    expect(pendingInMessage("")).toEqual([]);
  });
});

describe("the text that sends the turn back", () => {
  it("AC1: lists the items and asks to add them, or to say they need no entry", () => {
    expect(memoryStopReason(["Revisar el README.", "Subir la rama"], ES)).toBe(
      'Tu último mensaje deja pendientes que no están en la memoria de Specty:\n- Revisar el README.\n- Subir la rama\nAnota cada uno con `specty memory add "<texto>"`, escrito para alguien sin esta conversación, y cita su id en tu mensaje; o di que no hace falta anotarlos. Specty no lo volverá a pedir en este turno.',
    );
    expect(memoryStopReason(["Ship it"], EN)).toBe(
      'Your last message leaves pending items that are not in Specty\'s memory:\n- Ship it\nAdd each one with `specty memory add "<text>"`, written for someone without this conversation, and cite its id in your message; or say they need no entry. Specty will not ask again this turn.',
    );
  });
});
