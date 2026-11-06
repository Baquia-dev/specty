// SPDX-License-Identifier: Apache-2.0
import { AGENT_NAMES } from "@baquia-dev/specty-core/light";
import { agentName } from "./agent-name";

describe("an agent's name, by its tool", () => {
  it("AC4: gives each tool Specty knows by its name, and one it does not know by its id", () => {
    for (const [tool, name] of Object.entries(AGENT_NAMES)) expect(agentName(tool)).toBe(name);
    expect(agentName("codex")).toBe("Codex");
    expect(agentName("copilot")).toBe("GitHub Copilot");
    expect(agentName("zed")).toBe("zed");
    // A name of the object's prototype is no tool.
    expect(agentName("toString")).toBe("toString");
  });
});
