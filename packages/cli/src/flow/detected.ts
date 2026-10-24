// SPDX-License-Identifier: Apache-2.0
import { type Output, section, translator } from "@baquia-dev/specty-core";
import { detectProject, verifyCommands } from "../detect/project";
import { COMMAND, type Session } from "../session";

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
  const t = translator(session.lang);
  return [
    t(
      `Specty detecta ahora ${missing.join(" y ")}, que .specty/config.yaml no tiene: \`${COMMAND} init\` en ${main} lo añade.`,
      `Specty now detects ${missing.join(" and ")}, which .specty/config.yaml lacks: \`${COMMAND} init\` in ${main} adds it.`,
    ),
  ];
}

/** The closing card with the hints at its end. */
export function withVerifyHints(output: Output, hints: readonly string[]): Output {
  return hints.length === 0
    ? output
    : { ...output, blocks: [...output.blocks, ...section(undefined, hints)] };
}
