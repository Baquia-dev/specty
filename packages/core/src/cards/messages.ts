// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
import { ago } from "./status";
import { translator } from "./text";
import type { CardContext } from "./view";

// The messages between sessions (ADR 0016): what `specty message` says, and what the session of
// the change gets after its next shell command.

/** A message left for the session of a change: who left it, when and what it says. */
export interface MessageView {
  /** ISO 8601, in UTC. */
  readonly at: string;
  readonly text: string;
  readonly from: {
    readonly actor: "agent" | "human";
    /** The agent that left it, when Specty knows it. */
    readonly tool?: string;
    /** The open change of the folder it was left from, to reply to. */
    readonly change?: string;
    /** Absolute path of the folder it was left from. */
    readonly folder: string;
  };
}

/** Why `specty message` leaves nothing. */
export type MessageRefusal =
  | { readonly reason: "empty"; readonly id: string }
  | { readonly reason: "no-change"; readonly id: string };

/**
 * `specty message`: the message waits for the session of change `id`; `holder`, the agent that
 * stepped lately in its folder and how many minutes ago, or none when no session works on it now.
 */
export function messageLeftCard(
  id: string,
  text: string,
  ctx: CardContext,
  holder?: { readonly tool: string; readonly ago: number },
): Output {
  const t = translator(ctx.lang);
  return {
    status: "ok",
    header: headerOf(),
    blocks: section(undefined, [
      t(
        `Mensaje dejado para la sesión de ${id}: le llegará tras su siguiente comando en la carpeta del cambio.`,
        `Message left for the session of ${id}: it gets it after its next command in the change's folder.`,
      ),
      holder === undefined
        ? t(
            "Ahora ninguna sesión trabaja en ese cambio: le llegará a la que lo retome.",
            "No session works on that change now: whichever resumes it gets it.",
          )
        : t(
            `Ahora lo lleva ${holder.tool}: dio su último paso ${ago(holder.ago, t)}.`,
            `${holder.tool} holds it now: it last stepped ${ago(holder.ago, t)}.`,
          ),
      `«${text.trim()}»`,
    ]),
    next: t("sigue con tu trabajo.", "go on with your work."),
  };
}

/** Why `specty message` left nothing, and what to do instead. */
export function messageRefusalCard(refusal: MessageRefusal, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const { command } = ctx;
  const { id } = refusal;
  const [reason, next] =
    refusal.reason === "empty"
      ? [
          t("El mensaje está vacío.", "The message is empty."),
          t(
            `vuelve a ejecutar \`${command} message ${id} "<texto>"\` con el texto.`,
            `run \`${command} message ${id} "<text>"\` again with the text.`,
          ),
        ]
      : [
          t(
            `No hay ningún cambio abierto ${id}: un mensaje es para la sesión de un cambio abierto.`,
            `There is no open change ${id}: a message is for the session of an open change.`,
          ),
          t(
            `mira los cambios abiertos con \`${command} status\` y vuelve a ejecutar \`${command} message <id> "<texto>"\` con uno de ellos.`,
            `see the open changes with \`${command} status\` and run \`${command} message <id> "<text>"\` again with one of them.`,
          ),
        ];
  return {
    status: refusal.reason === "empty" ? "invalid" : "blocked",
    header: headerOf(),
    blocks: section(undefined, [reason]),
    next,
  };
}

/**
 * What the session of a change gets after a shell command: each message, in the order they came,
 * with when (UTC, to the minute), who left it and, from another change's session, how to reply.
 */
export function messagesNote(messages: readonly MessageView[], ctx: CardContext): string {
  const t = translator(ctx.lang);
  const lines = messages.flatMap(({ at, text, from }) => {
    const said = `  ${at.slice(11, 16)} UTC · ${t("de", "from")} ${sender(from, ctx)}: «${text.trim()}»`;
    if (from.change === undefined) return [said];
    const reply = t(
      `    Para responderle: \`${ctx.command} message ${from.change} "<respuesta>"\`.`,
      `    To reply: \`${ctx.command} message ${from.change} "<reply>"\`.`,
    );
    return [said, reply];
  });
  const heading = t(
    "specty: mensajes de otras sesiones (no son avisos del guard):",
    "specty: messages from other sessions (not guard warnings):",
  );
  return [heading, ...lines].join("\n");
}

/** Who left a message: the person, the session of a change, or a session in a folder. */
function sender(from: MessageView["from"], ctx: CardContext): string {
  const t = translator(ctx.lang);
  if (from.actor === "human") return t("la persona", "the person");
  const tool = from.tool === undefined ? "" : ` (${from.tool})`;
  return from.change === undefined
    ? t(`una sesión en ${from.folder}${tool}`, `a session in ${from.folder}${tool}`)
    : t(`la sesión de ${from.change}${tool}`, `the session of ${from.change}${tool}`);
}
