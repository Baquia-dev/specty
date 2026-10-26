// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output } from "../output";
import { blockedCard } from "./flow";
import { runNext, translator } from "./text";
import type { CardContext } from "./view";

/** Who ran the command: the way on from a refusal depends on it. */
export type Asker = "agent" | "person" | "ui";

/** `revisa \`specty status\``: where the person sees what waits for them. */
export function checkStatus(ctx: CardContext): string {
  return translator(ctx.lang)(
    `revisa \`${ctx.command} status\`.`,
    `check \`${ctx.command} status\`.`,
  );
}

/** When what the UI shows is out of date: the person reloads the review, or the whole UI. */
export function reloadNext(what: "review" | "ui", ctx: CardContext): string {
  const t = translator(ctx.lang);
  return what === "review"
    ? t("vuelve a cargar la revisión.", "reload the review.")
    : t("vuelve a cargar la UI.", "reload the UI.");
}

/**
 * No change is active in this folder. The agent asks `next` what to do, the person looks at
 * `status`, and the UI reloads, since the change it showed is gone.
 */
export function noActiveChangeCard(asker: Asker, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const next = {
    agent: runNext(ctx),
    person: checkStatus(ctx),
    ui: reloadNext("ui", ctx),
  }[asker];
  return blockedCard(headerOf(), t("No hay un cambio activo.", "There is no active change."), next);
}

/** A decision the person did not take: nothing changed, and where to look again. */
export function nothingChangedCard(header: string, next: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header,
    blocks: [{ lines: [t("Nada cambió.", "Nothing changed.")] }],
    next,
  };
}

/** A command run outside a git repository: Specty needs one before anything else. */
export function notGitCard(ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return blockedCard(
    headerOf(),
    t("Esto no es un repositorio git.", "This is not a git repository."),
    t("ejecuta `git init`.", "run `git init`."),
  );
}

/** `.specty/config.yaml` is not valid: `issues` says why, and no command runs until it is. */
export function invalidConfigCard(issues: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return {
    ...blockedCard(
      headerOf(),
      issues,
      t("corrige .specty/config.yaml.", "fix .specty/config.yaml."),
    ),
    status: "invalid",
  };
}
