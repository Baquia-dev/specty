// SPDX-License-Identifier: Apache-2.0
import { type Output, section, verifyHintLine } from "@baquia-dev/specty-core";
import { detectProject, verifyCommands } from "../detect/project";
import type { Session } from "../session";

/**
 * The verification the detection finds in this folder and `.specty/config.yaml` lacks, as a line
 * that proposes `init` in `main`, which adds it: after the change that created the project,
 * nothing else would notice. Read before the change is incorporated, while its folder exists.
 */
export async function verifyHints(session: Session, main: string): Promise<readonly string[]> {
  const detected = verifyCommands((await detectProject(session.root, "")).commands);
  const missing = (["default", "full"] as const).flatMap((key) => {
    const value = detected[key];
    return value === undefined || session.config.verify[key] !== undefined
      ? []
      : [`verify.${key} (\`${value}\`)`];
  });
  if (missing.length === 0) return [];
  return [verifyHintLine(missing, main, session.cards)];
}

/** The closing card with the hints at its end. */
export function withVerifyHints(output: Output, hints: readonly string[]): Output {
  return hints.length === 0
    ? output
    : { ...output, blocks: [...output.blocks, ...section(undefined, hints)] };
}
