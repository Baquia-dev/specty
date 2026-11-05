// SPDX-License-Identifier: Apache-2.0
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGE, CONFIG, read } from "../support";
import { call, implemented, listen, path, serving } from "./support";

/** A unit's shell command: Node appends `name` to `.git/marks`, so the file says what ran, in order. */
const command = (name: string) =>
  `node -e "require('fs').appendFileSync(process.argv[1] + '/marks', '${name}')" "$(git rev-parse --git-common-dir)"`;

/** A unit of `verify.units` in YAML, under `units:`. */
const unit = (name: string, paths: readonly string[]) =>
  `    - name: ${name}\n      command: ${JSON.stringify(command(name))}\n      paths: ${JSON.stringify(paths)}\n`;

const CONFIGURED = `${CONFIG()}  units:\n${unit("a", ["src/app.ts"])}${unit("b", ["src/**"])}`;
/** The command of the full verification: every unit's, joined. */
const FULL = `${command("a")} && ${command("b")}`;

/** What the units of `root` ran, in order, one mark each. */
const marks = (root: string) => readFile(join(root, ".git", "marks"), "utf8").catch(() => "");

/** The files of the clone's record of units that passed. */
const recorded = async (root: string) =>
  (await readdir(join(root, ".git", "common", "specty", "verified")).catch(() => [])).filter(
    (name) => name.endsWith(".json"),
  );

/** The `data` of each `change.verified` of the change, oldest first. */
async function verifications(root: string): Promise<Record<string, unknown>[]> {
  const text = await read(root, `.specty/changes/${CHANGE}/audit.jsonl`);
  return text
    .trim()
    .split("\n")
    .map((line): { event: string; data: Record<string, unknown> } => JSON.parse(line))
    .filter(({ event }) => event === "change.verified")
    .map(({ data }) => data);
}

/** Waits, in real time, until the change's audit has `count` full verifications. */
async function verified(root: string, count: number): Promise<void> {
  const deadline = Date.now() + 20_000;
  while ((await verifications(root)).length < count) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((done) => setTimeout(done, 50));
  }
}

describe("the full verification from the local server with verify.units", () => {
  it("AC5: runs in order only the units that have not passed, and records them", async () => {
    const { root, server, headers } = await serving(true, CONFIGURED);
    const events = listen(server.port, headers);
    try {
      await implemented(root, "1\n", "2\n");
      await events.until(({ name }) => name === "changes");
      const started = await call(server.port, path("verify"), headers, {});
      expect(started.status).toBe(200);
      // The card names the full verification's command, escaped as JSON.
      expect(started.body).toContain(JSON.stringify(FULL).slice(1, -1));
      await verified(root, 1);
      expect(await marks(root)).toBe("ab");
      expect(await recorded(root)).toHaveLength(2);
      expect((await verifications(root))[0]).toMatchObject({
        cmd: FULL,
        exit: 0,
        tree: expect.stringMatching(/^sha256:/),
        units: {
          reused: [],
          passed: [
            { name: "a", ms: expect.any(Number) },
            { name: "b", ms: expect.any(Number) },
          ],
          skipped: [],
        },
      });

      // Both passed on this code: the next run runs none, and says so.
      expect((await call(server.port, path("verify"), headers, {})).status).toBe(200);
      await verified(root, 2);
      expect(await marks(root)).toBe("ab");
      expect((await verifications(root))[1]).toMatchObject({
        cmd: FULL,
        exit: 0,
        units: { reused: ["a", "b"], passed: [], skipped: [] },
      });
    } finally {
      events.close();
      await server.close();
    }
  });
});
