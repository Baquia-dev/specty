// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { fingerprint } from "../../src/server/events";
import { AGENT, APP, cli, tempRepo } from "../support";
import { sessionAt } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

describe("the events of the local server", () => {
  it("AC4: change their fingerprint when someone writes in the memory", async () => {
    const root = await tempRepo(APP);
    const print = async () => fingerprint(await sessionAt(root, AGENT));
    const before = await print();
    expect(await print()).toBe(before);
    expect((await cli(root, ["memory", "add", "Uno"], CLAUDE)).code).toBe(0);
    const added = await print();
    expect(added).not.toBe(before);
    expect((await cli(root, ["memory", "add", "Dos"], CLAUDE)).code).toBe(0);
    expect(await print()).not.toBe(added);
  });
});
