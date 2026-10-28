// SPDX-License-Identifier: Apache-2.0
import type { Output } from "@baquia-dev/specty-core";
import { Argument, type Command } from "commander";
import type { ReportOutput } from "../check/provider";
import { withChangeLock } from "../flow/active";
import type { Session } from "../session";
import { accept } from "./accept";
import { approve } from "./approve";
import { delegate } from "./delegate";
import { cancel, close } from "./finish";
import { type PersonAction, personSession } from "./human";
import { reject } from "./scope-decision";

type Run = (handler: (session: Session) => Promise<Output | ReportOutput>) => () => Promise<void>;

/**
 * A person's decision runs in the folder of the change it applies to, from any folder, with that
 * change locked (ARCHITECTURE §9).
 */
function decider(run: Run) {
  return (
    action: PersonAction,
    options: { readonly id: string | undefined; readonly scope?: string | undefined },
    handler: (session: Session) => Promise<Output>,
  ) =>
    run(async (session) => {
      const chosen = await personSession(session, action, options);
      if (chosen.kind === "output") return chosen.output;
      return withChangeLock(chosen.session, action, () => handler(chosen.session));
    })();
}

/** Registers the person's decisions (ARCHITECTURE §6), and turning delegated mode on or off. */
export function personCommands(program: Command, run: Run): void {
  const decide = decider(run);
  const CHANGE = ["[change]", "the change's id (default: the one waiting)"] as const;
  program
    .command("approve")
    .description("approve the spec or a scope request (person only)")
    .argument(...CHANGE)
    .option("--scope <id>")
    .action((id: string | undefined, options: { scope?: string }) =>
      decide("approve", { id, scope: options.scope }, (session) => approve(session, options.scope)),
    );
  program
    .command("reject")
    .description("reject a scope request (person only)")
    .argument(...CHANGE)
    .requiredOption("--scope <id>")
    .option("--reason <text>")
    .action((id: string | undefined, options: { scope: string; reason?: string }) =>
      decide("reject", { id, scope: options.scope }, (session) =>
        reject(session, options.scope, options.reason),
      ),
    );
  program
    .command("accept")
    .description("accept the result (person only)")
    .argument(...CHANGE)
    .action((id: string | undefined) => decide("accept", { id }, accept));
  program
    .command("close")
    .description("confirm the closing (person only)")
    .argument(...CHANGE)
    .action((id: string | undefined) => decide("close", { id }, close));
  program
    .command("cancel")
    .description("cancel the change (person only)")
    .argument(...CHANGE)
    .option("--reason <text>")
    .action((id: string | undefined, options: { reason?: string }) =>
      decide("cancel", { id }, (session) => cancel(session, options.reason)),
    );
  program
    .command("delegate")
    .description("let your agent take your decisions, or take them back (person only)")
    .addArgument(new Argument("<mode>", "on or off").choices(["on", "off"]))
    .action((mode: string) => run((session) => delegate(session, mode === "on" ? "on" : "off"))());
}
