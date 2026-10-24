// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { type Output, section } from "../output";
import type { LongFile } from "../sizing/lines";
import { translator } from "./text";
import type { CardContext, TaskView } from "./view";

/** One line per file a task left past the warning line: for the agent's card and the person. */
export function longFileWarnings(tasks: readonly TaskView[], lang: Lang): string[] {
  const t = translator(lang);
  return tasks.flatMap((task) =>
    (task.longFiles ?? []).map((file) =>
      t(
        `${task.id}: ${file.path}, ${file.lines} líneas de código (aviso a partir de ${file.limit}).`,
        `${task.id}: ${file.path}, ${file.lines} lines of code (warning past ${file.limit}).`,
      ),
    ),
  );
}

/** A criterion, not a number: a long file is a reason to look at it, not to cut it anywhere. */
export function splitAdvice(lang: Lang): string {
  return translator(lang)(
    "Si un archivo mezcla responsabilidades, propón cómo dividirlo antes de seguir; nunca lo partas solo para cumplir el número.",
    "If a file mixes responsibilities, propose how to split it before going on; never split it just to meet the number.",
  );
}

/** `task done` refused: the task took files past the maximum. */
export function longFileCard(
  header: string,
  task: string,
  files: readonly LongFile[],
  ctx: CardContext,
): Output {
  const t = translator(ctx.lang);
  return {
    status: "blocked",
    header,
    blocks: section(
      t("ARCHIVOS DEMASIADO LARGOS", "FILES TOO LONG"),
      files.map((file) =>
        t(
          `${file.path}: ${file.lines} líneas de código (máximo ${file.limit})`,
          `${file.path}: ${file.lines} lines of code (max ${file.limit})`,
        ),
      ),
    ),
    next: t(
      `divide esos archivos por responsabilidad (pide con \`${ctx.command} scope add\` los archivos nuevos que necesites) y vuelve a ejecutar \`${ctx.command} task done ${task} --summary "<qué hiciste>"\`; si de verdad son una sola responsabilidad, explícaselo al usuario, que puede cambiar \`lines.fail\` en .specty/config.yaml.`,
      `split those files by responsibility (request with \`${ctx.command} scope add\` the new files you need) and run \`${ctx.command} task done ${task} --summary "<what you did>"\` again; if each is truly one responsibility, explain it to the user, who can change \`lines.fail\` in .specty/config.yaml.`,
    ),
  };
}
