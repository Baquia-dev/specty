// SPDX-License-Identifier: Apache-2.0
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { launch, type Session } from "../src/launch";

/** A Node script as the agent, `node -e <script>`, with `session`. */
const node = (script: string, session: Session, timeoutMs = 10_000) =>
  launch(process.execPath, ["-e", script], {
    cwd: tmpdir(),
    env: process.env,
    timeoutMs,
    session,
  });

/**
 * An agent that echoes each message of its input, then, a moment later, says it is ready, split
 * across two writes; and says when its input closes, and leaves.
 */
const ECHO = `
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  console.log("eco:" + chunk.trim());
  setTimeout(() => {
    process.stdout.write("lis");
    setTimeout(() => console.log("to"), 50);
  }, 200);
});
process.stdin.on("end", () => {
  console.log("cerrada");
  process.exit(0);
});
`;

describe("an agent's run with its conversation kept open", () => {
  it("AC1: its input starts with the session's message and stays open until the line the session waits for, which it reads whole", async () => {
    const seen: string[] = [];
    const run = node(ECHO, {
      input: "hola\n",
      done: (line) => {
        seen.push(line);
        return line === "listo";
      },
    });
    expect(run.running()).toBe(true);
    const finished = await run.finished;
    // Closed only after «listo»: had it closed sooner, «cerrada» would come before it.
    expect(finished).toEqual({ status: 0, stdout: "eco:hola\nlisto\ncerrada\n", stderr: "" });
    // Once done, the session reads no more lines.
    expect(seen).toEqual(["eco:hola", "listo"]);
    expect(run.running()).toBe(false);
  });

  it("AC1: one whose session never ends is stopped by its limit and ends without a code", async () => {
    const run = node(
      "process.stdin.resume(); process.stdin.on('end', () => process.exit(0));",
      { input: "hola\n", done: () => false },
      300,
    );
    const finished = await run.finished;
    expect(finished.status).toBeNull();
    expect(run.running()).toBe(false);
  });
});
