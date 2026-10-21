// SPDX-License-Identifier: Apache-2.0
import { resolveInvocation } from "./install/invocation";
import { runCli } from "./program";
import type { Invocation } from "./session";
import { systemTerminal } from "./terminal";

const argv = process.argv.slice(2);
/** Only `init` and `doctor` need to know how hooks should call Specty; the rest stay fast. */
const needsInvocation = argv.includes("init") || argv.includes("doctor");
const invocation: Invocation = needsInvocation
  ? await resolveInvocation(process.argv[1], process.cwd())
  : { command: "specty", portable: true };

process.exitCode = await runCli(argv, {
  cwd: process.cwd(),
  env: process.env,
  now: () => new Date(),
  terminal: systemTerminal(),
  io: {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
  },
  invocation,
  stdin: async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  },
});
