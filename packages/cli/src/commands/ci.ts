// SPDX-License-Identifier: Apache-2.0
import {
  checkLevel,
  ciReport,
  type Output,
  renderReport,
  reportExitCode,
  reportJson,
} from "@baquia-dev/specty-core";
import type { Command } from "commander";
import type { ReportOutput } from "../check/provider";
import { type CiOptions, ciFacts } from "../flow/ci-commits";
import { githubOptions } from "../flow/ci-github";
import type { Session } from "../session";

/** `specty ci`'s options as commander reads them. */
interface CiFlags extends CiOptions {
  readonly verbose?: boolean;
}

export function ciCommand(
  program: Command,
  run: (handler: (session: Session) => Promise<Output | ReportOutput>) => () => Promise<void>,
): void {
  program
    .command("ci")
    .description(
      "check that the commits of a pull request or a push trace back to approved changes",
    )
    .option(
      "--base <ref>",
      "where the range starts: the pull request's target, or the commit before a push (default: the target branch)",
    )
    .option("--into <branch>", "the branch the commits go into (default: the one --base names)")
    .option("--head-ref <branch>", "the pull request's branch")
    .option("--verbose", "every finding and the checks that passed")
    .action((options: CiFlags) => run((session) => ci(session, options))());
}

/**
 * `specty ci` (ARCHITECTURE §10): the commits of the range, traced to approved changes and with
 * no spike going into the target branch, in the report and the JSON of `specty check`.
 */
async function ci(session: Session, options: CiFlags): Promise<ReportOutput> {
  // Without `--base`, a GitHub Actions run says which commits to check; the options still win.
  const event = options.base === undefined ? await githubOptions(session.environment.env) : {};
  const facts = await ciFacts(session, { ...event, ...options });
  const report = ciReport(facts, (id) => checkLevel(session.config, id), session.lang);
  return {
    report: renderReport(report, {
      lang: session.lang,
      verbose: options.verbose === true,
      maxFindings: session.config.checks.maxFindings,
    }),
    json: reportJson(report),
    code: reportExitCode(report),
  };
}
