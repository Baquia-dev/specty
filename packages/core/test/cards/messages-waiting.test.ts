// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  messageLeftCard,
  renderText,
  type StatusEntry,
  statusCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const ID = "20261104-otro";

const entry = (extra: Partial<StatusEntry> = {}): StatusEntry => ({
  id: "a",
  kind: "standard",
  phase: "implementing",
  title: "A",
  waitingFor: "agent",
  current: false,
  pendingScope: [],
  ...extra,
});

/** The status line of `extra`'s change, in `ctx`'s language. */
const line = (extra: Partial<StatusEntry>, ctx: CardContext = ES): string | undefined =>
  renderText(statusCard([entry(extra)], ctx), ctx.lang)
    .split("\n")
    .find((text) => text.includes("— A"))
    ?.trimStart();

describe("who gets a message, as it is left", () => {
  it("AC1: names the agent that holds the change now and how long ago it stepped", () => {
    const holder = { tool: "claude-code", ago: 2 };
    const es = renderText(messageLeftCard(ID, "Trae main.", ES, holder), "es");
    expect(es).toContain(
      `Mensaje dejado para la sesión de ${ID}: le llegará tras su siguiente comando en la carpeta del cambio.`,
    );
    expect(es).toContain("Ahora lo lleva claude-code: dio su último paso hace 2 min.");
    expect(es).toContain("«Trae main.»");
    const en = renderText(messageLeftCard(ID, "Trae main.", EN, holder), "en");
    expect(en).toContain("claude-code holds it now: it last stepped 2 min ago.");
  });

  it("AC2: says that no session works on the change now, and who will get it", () => {
    const es = renderText(messageLeftCard(ID, "Trae main.", ES), "es");
    expect(es).toContain(
      "Ahora ninguna sesión trabaja en ese cambio: le llegará a la que lo retome.",
    );
    expect(es).not.toContain("Ahora lo lleva");
    const en = renderText(messageLeftCard(ID, "Trae main.", EN), "en");
    expect(en).toContain("No session works on that change now: whichever resumes it gets it.");
  });
});

describe("the messages waiting, in the status line", () => {
  it("AC3: counts them at the end of the line, in Spanish and in English", () => {
    expect(line({ holder: { tool: "claude-code", ago: 3 }, messages: 2 })).toBe(
      "a · standard · implementing · espera al agente — A · lo lleva claude-code, hace 3 min · 2 mensajes esperan",
    );
    expect(line({ messages: 1 })).toBe(
      "a · standard · implementing · espera al agente — A · 1 mensaje espera",
    );
    expect(line({ messages: 2 }, EN)).toBe(
      "a · standard · implementing · waits for the agent — A · 2 messages waiting",
    );
    expect(line({ messages: 1 }, EN)).toContain("— A · 1 message waiting");
  });

  it("AC3: says nothing without messages, and gives them as data", () => {
    expect(line({})).toBe("a · standard · implementing · espera al agente — A");
    const card = statusCard([entry({ messages: 3 })], ES);
    expect(card.changes[0]?.messages).toBe(3);
  });
});
