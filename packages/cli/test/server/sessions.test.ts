// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGE, NOW, writeFiles } from "../support";
import { call, serving } from "./support";

const MINUTE = 60_000;

/** `minutes` before NOW, as an ISO date. */
const before = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE).toISOString();

/** Conversation `conversation` of `tool` last stepped in `folder` `minutes` before NOW. */
const stepped = (
  root: string,
  tool: string,
  conversation: string,
  folder: string,
  minutes: number,
) =>
  writeFiles(root, {
    [`.git/common/specty/activity/${tool}-${conversation}.json`]: JSON.stringify({
      tool,
      folder,
      first: before(minutes + 30),
      last: before(minutes),
    }),
  });

/** A ccusage in `root` whose session report has Claude Code's session `s1`. */
async function ccusage(root: string): Promise<void> {
  const breakdown = {
    modelName: "claude-opus-5-5",
    inputTokens: 1000,
    outputTokens: 200,
    cacheCreationTokens: 3000,
    cacheReadTokens: 50_000,
    cost: 0.75,
  };
  const report = {
    sessions: [{ sessionId: "s1", projectPath: "-repo", modelBreakdowns: [breakdown, breakdown] }],
    totals: {},
  };
  const replies = { "claude session --json --offline": report };
  const bin = join(root, "node_modules", ".bin");
  await mkdir(bin, { recursive: true });
  await writeFile(
    join(bin, "ccusage"),
    `#!/usr/bin/env node\nconst replies = ${JSON.stringify(replies)};\nconst reply = replies[process.argv.slice(2).join(" ")];\nif (reply === undefined) process.exit(2);\nprocess.stdout.write(JSON.stringify(reply));\n`,
  );
  await chmod(join(bin, "ccusage"), 0o755);
}

describe("the agent sessions in the local server", () => {
  it("AC1: gives each conversation, its folder and change, its steps and whether it lives, newest first", async () => {
    const { root, server, headers } = await serving(false);
    try {
      await stepped(root, "codex", "t9", join(root, ".worktrees", "otro"), 120);
      await stepped(root, "claude-code", "s1", root, 2);
      const answer = await call(server.port, "/api/sessions", headers);
      expect(answer.status).toBe(200);
      expect(JSON.parse(answer.body)).toEqual([
        {
          tool: "claude-code",
          conversation: "s1",
          folder: "",
          change: CHANGE,
          first: before(32),
          last: before(2),
          live: true,
        },
        {
          tool: "codex",
          conversation: "t9",
          folder: ".worktrees/otro",
          first: before(150),
          last: before(120),
          live: false,
        },
      ]);
      expect((await call(server.port, "/api/sessions")).status).toBe(403);
    } finally {
      await server.close();
    }
  });

  it("AC2: adds what each Claude Code session spent when ccusage tells it", async () => {
    const { root, server, headers } = await serving(false);
    try {
      await stepped(root, "claude-code", "s1", root, 2);
      await stepped(root, "codex", "t9", root, 5);
      await ccusage(root);
      const body = JSON.parse((await call(server.port, "/api/sessions", headers)).body);
      expect(body[0]).toMatchObject({ conversation: "s1", usage: { tokens: 108_400, cost: 1.5 } });
      expect(body[1]).toMatchObject({ conversation: "t9" });
      expect(body[1]).not.toHaveProperty("usage");
    } finally {
      await server.close();
    }
  });
});
