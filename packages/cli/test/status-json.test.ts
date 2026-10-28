// SPDX-License-Identifier: Apache-2.0
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { APP, CHANGE, cli, inWorktree, person, tempRepo } from "./support";

describe("`specty --json status`", () => {
  it("carries the open changes as data, with the folder of those elsewhere", async () => {
    const { root, folder } = await inWorktree();
    const here = JSON.parse((await cli(folder, ["--json", "status"])).out);
    expect(here).toMatchObject({
      status: "ok",
      exitCode: 0,
      delegated: false,
      changes: [
        {
          id: CHANGE,
          kind: "standard",
          phase: "draft",
          title: "Saludo personalizado",
          waitingFor: "agent",
          current: true,
          pendingScope: [],
        },
      ],
    });
    expect(here.changes[0]).not.toHaveProperty("folder");

    const fromRoot = JSON.parse((await cli(root, ["--json", "status"])).out);
    expect(fromRoot.changes).toMatchObject([
      { id: CHANGE, current: false, folder: `../${basename(root)}.worktrees/${CHANGE}` },
    ]);
  });

  it("says whether delegated mode is on, with no change open", async () => {
    const root = await tempRepo(APP);
    await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    const status = JSON.parse((await cli(root, ["--json", "status"])).out);
    expect(status).toMatchObject({ changes: [], delegated: true });
  });
});
