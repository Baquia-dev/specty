// SPDX-License-Identifier: Apache-2.0
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { launch } from "../src/launch";

/** A Node script as the agent: `node -e <script>`. */
const node = (script: string, timeoutMs = 10_000) =>
  launch(process.execPath, ["-e", script], { cwd: tmpdir(), env: process.env, timeoutMs });

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("an agent's run without blocking the suite", () => {
  it("AC4: the suite goes on while it runs, knows whether it still runs, and gets its output and code at the end", async () => {
    const run = node(
      "setTimeout(() => { console.log('hecho'); console.error('aviso'); process.exit(3); }, 300)",
    );
    expect(run.running()).toBe(true);
    let looks = 0;
    while (run.running()) {
      looks += 1;
      await pause(20);
    }
    expect(looks).toBeGreaterThan(1);
    expect(await run.finished).toEqual({ status: 3, stdout: "hecho\n", stderr: "aviso\n" });
  });

  it("AC4: its input is closed, as it was when the suite blocked on it", async () => {
    const run = node("process.stdin.resume(); process.stdin.on('end', () => process.exit(0));");
    expect((await run.finished).status).toBe(0);
  });

  it("AC4: one over its limit is stopped and ends without a code", async () => {
    const run = node("setTimeout(() => {}, 60_000)", 300);
    const finished = await run.finished;
    expect(finished.status).toBeNull();
    expect(run.running()).toBe(false);
  });

  it("AC4: one the suite stops ends as its limit ends it: by a signal, without a code", async () => {
    const run = node("setTimeout(() => {}, 60_000)");
    expect(run.running()).toBe(true);
    run.stop();
    const finished = await run.finished;
    expect(finished.status).toBeNull();
    expect(run.running()).toBe(false);
  });
});
