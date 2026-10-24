// SPDX-License-Identifier: Apache-2.0
import {
  type ChangedFile,
  contentRisks,
  isGoverned,
  type RiskFinding,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";

/**
 * The known risks in what the working tree adds to the governed files since `base`, new files
 * included: the diff runs against a tree with their current content, so nothing is staged.
 */
export async function riskFindings(
  session: Session,
  base: string | undefined,
  changed: readonly ChangedFile[],
): Promise<readonly RiskFinding[]> {
  if (base === undefined) return [];
  const paths = changed
    .flatMap((file) => (file.from === undefined ? [file.path] : [file.from, file.path]))
    .filter((path) => !path.startsWith(".specty/") && isGoverned(path, session.config));
  if (paths.length === 0) return [];
  const tree = await session.git.treeWith(paths);
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
    tree,
    "--",
    ...paths,
  ]);
  return result.code === 0 ? contentRisks(result.stdout) : [];
}
