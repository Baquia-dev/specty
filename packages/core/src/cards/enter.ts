// SPDX-License-Identifier: Apache-2.0
import { headerOf, type Output, section } from "../output";
import { blockedCard } from "./flow";
import { translator } from "./text";
import type { CardContext } from "./view";

/**
 * `specty enter <id>`: where the conversation works now, then what `next` says in that folder.
 * The guard of the agent's tool bound the conversation to it before the command ran.
 */
export function enteredCard(folder: string, card: Output, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  const lead = t(
    `Esta conversación trabaja ahora en \`${folder}\`: lee, escribe y ejecuta los comandos allí, con las rutas de esa carpeta.`,
    `This conversation now works in \`${folder}\`: read, write and run commands there, with that folder's paths.`,
  );
  return { ...card, blocks: [...section(undefined, [lead]), ...card.blocks] };
}

/** `specty enter <id>` for an open change whose folder was lost: `restore` brings it back first. */
export function lostFolderCard(id: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return blockedCard(
    headerOf(id),
    t(
      `La carpeta del cambio ${id} se perdió; el cambio sigue en su rama.`,
      `The folder of change ${id} was lost; the change is still on its branch.`,
    ),
    t(
      `recupérala con \`${ctx.command} restore ${id}\` y vuelve a ejecutar \`${ctx.command} enter ${id}\`.`,
      `bring it back with \`${ctx.command} restore ${id}\` and run \`${ctx.command} enter ${id}\` again.`,
    ),
  );
}

/** `specty enter <id>` for a change without a folder of its own in `home`: nowhere to enter. */
export function noFolderCard(id: string, home: string, ctx: CardContext): Output {
  const t = translator(ctx.lang);
  return blockedCard(
    headerOf(id),
    t(
      `El cambio ${id} no tiene carpeta propia en \`${home}\`: no hay dónde entrar.`,
      `Change ${id} has no folder of its own in \`${home}\`: there is nowhere to enter.`,
    ),
    t(
      `comprueba el id con \`${ctx.command} status\`; si el cambio vive en esta carpeta, sigue con \`${ctx.command} next\`.`,
      `check the id with \`${ctx.command} status\`; if the change lives in this folder, go on with \`${ctx.command} next\`.`,
    ),
  );
}
