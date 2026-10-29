// SPDX-License-Identifier: Apache-2.0
import { historyOf } from "./history";
import { REVIEWER, sampleRecords } from "./sample-records";

const at = "2026-10-29T10:00:00.000Z";

describe("who did each thing, in the History's data", () => {
  it("AC1: keeps the person's name, and goes without it on the lines from before", () => {
    const audit = [
      { ts: at, actor: "human", by: "Ana Gómez", event: "spec.approved", data: { revision: 1 } },
      { ts: at, actor: "human", event: "change.closed", data: {} },
    ] as const;
    const entries = historyOf(audit);
    expect(entries[0]).toMatchObject({ actor: "human", by: "Ana Gómez" });
    expect(entries[1]).not.toHaveProperty("by");
  });

  it("AC2: keeps the agent's model and effort, and names the person in a delegated decision", () => {
    const audit = [
      {
        ts: at,
        actor: "agent",
        tool: "claude-code",
        model: "claude-opus-5-5",
        effort: "high",
        event: "spec.proposed",
        data: { revision: 1 },
      },
      {
        ts: at,
        actor: "agent",
        tool: "claude-code",
        by: "Ana Gómez",
        event: "change.accepted",
        data: { revision: 1, delegated: true },
      },
      { ts: at, actor: "agent", event: "change.closed", data: { delegated: true } },
    ] as const;
    const [proposed, accepted, closed] = historyOf(audit);
    expect(proposed).toMatchObject({
      tool: "claude-code",
      model: "claude-opus-5-5",
      effort: "high",
    });
    expect(accepted?.details).toContainEqual({
      es: "Por delegación de Ana Gómez: lo decidió el agente",
      en: "Delegated by Ana Gómez: the agent decided",
    });
    expect(closed?.details).toContainEqual({
      es: "Por delegación: lo decidió el agente",
      en: "Delegated: the agent decided",
    });
  });

  it("AC1: the prototype's samples say who did each thing", () => {
    const audit = sampleRecords(Date.now()).flatMap((record) => record.audit ?? []);
    const people = audit.filter((line) => line.actor === "human");
    const agent = audit.filter((line) => line.actor === "agent");
    expect(people.length).toBeGreaterThan(0);
    expect(people.every((line) => "by" in line && line.by === REVIEWER)).toBe(true);
    expect(agent.length).toBeGreaterThan(0);
    expect(agent.every((line) => "model" in line && "effort" in line)).toBe(true);
  });
});
