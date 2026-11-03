// SPDX-License-Identifier: Apache-2.0
import { type OutputBlock, section } from "../output";
import { type Translate, translator } from "./text";
import type { CardContext } from "./view";

/**
 * A tool at the project's root that would also see what Specty writes (`.specty/`, the agents'
 * hooks, the changes' worktrees in `.worktrees/`), and its exclusion: what to add and where.
 */
export interface ExclusionView {
  readonly name: string;
  readonly path: string;
  readonly add: string;
  readonly file: string;
}

/** Each tool's line, the same in `doctor`, `next` and `init`, so it is recognised in all three. */
export function exclusionLine(tool: ExclusionView, t: Translate): string {
  return t(
    `${tool.name} también revisa ${tool.path}, que escribe Specty: añade ${tool.add} en ${tool.file}.`,
    `${tool.name} also checks ${tool.path}, which Specty writes: add ${tool.add} to ${tool.file}.`,
  );
}

/**
 * Specty doesn't edit those configurations (they are the project's code): the agent does, in a
 * change the person approves. `next` tells the agent to say so to the user; `init`, whoever runs it.
 */
export function exclusionsBlock(
  tools: readonly ExclusionView[],
  ctx: CardContext,
  card: "next" | "init",
): OutputBlock[] {
  if (tools.length === 0) return [];
  const t = translator(ctx.lang);
  const title = t(
    '"Las herramientas no ven lo que escribe Specty"',
    '"Tools do not see what Specty writes"',
  );
  const closing =
    card === "next"
      ? t(
          `Díselo al usuario. Si quiere que lo corrijas, es un cambio como cualquier otro: \`${ctx.command} new ${title} --request "<petición literal del usuario>"\`.`,
          `Tell the user. If they want you to fix it, it is a change like any other: \`${ctx.command} new ${title} --request "<the user's literal request>"\`.`,
        )
      : t(
          `Se corrige en un cambio, como cualquier otro: el agente edita cada configuración y la persona aprueba el diff (\`${ctx.command} new ${title}\`).`,
          `It is fixed in a change like any other: the agent edits each configuration and the person approves the diff (\`${ctx.command} new ${title}\`).`,
        );
  return section(
    t("HERRAMIENTAS QUE VEN LO QUE ESCRIBE SPECTY", "TOOLS THAT SEE WHAT SPECTY WRITES"),
    [...tools.map((tool) => exclusionLine(tool, t)), closing],
  );
}
