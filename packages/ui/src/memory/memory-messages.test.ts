// SPDX-License-Identifier: Apache-2.0

import type { StatusEntry } from "@baquia-dev/specty-core";
import { translator } from "@baquia-dev/specty-core/light";
import { changeLine } from "./memory-lines";

const change = (extra: Partial<StatusEntry> = {}): StatusEntry => ({
  id: "20261104-a",
  kind: "standard",
  phase: "implementing",
  title: "A",
  waitingFor: "agent",
  current: false,
  pendingScope: [],
  ...extra,
});

describe("the messages waiting, under a change of the memory page", () => {
  it("AC4: says how many wait, in Spanish and in English", () => {
    const held = { holder: { tool: "claude-code", ago: 0 } };
    expect(changeLine(change({ ...held, messages: 2 }), translator("es"))).toBe(
      "20261104-a · standard · espera al agente · lo lleva claude-code, ahora mismo · 2 mensajes esperan",
    );
    expect(changeLine(change({ messages: 1 }), translator("es"))).toContain("· 1 mensaje espera");
    expect(changeLine(change({ messages: 2 }), translator("en"))).toContain("· 2 messages waiting");
    expect(changeLine(change({ messages: 1 }), translator("en"))).toContain("· 1 message waiting");
  });

  it("AC4: says nothing about messages when none wait", () => {
    expect(changeLine(change(), translator("es"))).not.toContain("mensaje");
  });
});
