// SPDX-License-Identifier: Apache-2.0
import type { Invocation } from "./session";

const argv = process.argv.slice(2);
const base = {
  cwd: process.cwd(),
  env: process.env,
  now: () => new Date(),
  io: {
    out: (text: string) => process.stdout.write(`${text}\n`),
    err: (text: string) => process.stderr.write(`${text}\n`),
  },
  stdin: async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  },
  input: process.stdin,
};

// The hooks run on every agent action and every commit: they load only their own entry.
const hooked =
  argv[0] === "guard" || argv[0] === "hook"
    ? await (await import("./enforce/entry")).runHook(argv, base)
    : undefined;

if (hooked !== undefined) {
  process.exitCode = hooked;
} else {
  const [{ resolveInvocation }, { runCli }, { systemTerminal }] = await Promise.all([
    import("./install/invocation"),
    import("./program"),
    import("./terminal"),
  ]);
  /** Only `init` and `doctor` need to know how hooks should call Specty; the rest stay fast. */
  const needsInvocation = argv.includes("init") || argv.includes("doctor");
  const invocation: Invocation = needsInvocation
    ? await resolveInvocation(process.argv[1], process.cwd())
    : { command: "specty", portable: true };
  process.exitCode = await runCli(argv, {
    ...base,
    terminal: systemTerminal(base.env),
    invocation,
  });
}
