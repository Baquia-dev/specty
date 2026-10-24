// SPDX-License-Identifier: Apache-2.0
import {
  type AssertionLoss,
  type ChangedFile,
  isTestFile,
  removedAssertions,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";

/** The assertions the working tree removed, since `base`, from tests that already existed there. */
export async function assertionLosses(
  session: Session,
  base: string | undefined,
  changed: readonly ChangedFile[],
): Promise<readonly AssertionLoss[]> {
  if (base === undefined) return [];
  // A new test has nothing to lose; a modified, renamed or deleted one may.
  const paths = changed
    .filter((file) => file.status !== "added")
    .filter((file) => isTestFile(file.path) || (file.from !== undefined && isTestFile(file.from)))
    .flatMap((file) => (file.from === undefined ? [file.path] : [file.from, file.path]));
  if (paths.length === 0) return [];
  const result = await session.git.run([
    "--literal-pathspecs",
    "-c",
    "core.quotePath=false",
    "diff",
    "-U0",
    "--no-color",
    "--no-ext-diff",
    "-M",
    base,
    "--",
    ...paths,
  ]);
  return result.code === 0 ? removedAssertions(result.stdout) : [];
}
