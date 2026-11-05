// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { type Output, section } from "../output";
import { translator } from "./text";

/**
 * `card` with the development ports of its change's folder (`dev.ports` plus the folder's place),
 * for the agent to start its servers on; the card as it is without ports.
 */
export function withDevPorts(card: Output, ports: readonly number[], lang: Lang): Output {
  if (ports.length === 0) return card;
  const t = translator(lang);
  const list = ports.join(", ");
  const line = t(
    `Puertos de desarrollo de esta carpeta: ${list}. Arranca aquí los servidores de desarrollo con ellos, para no chocar con los de otras carpetas.`,
    `Development ports of this folder: ${list}. Start this folder's development servers on them, so they do not clash with other folders'.`,
  );
  return { ...card, blocks: [...card.blocks, ...section(undefined, [line])] };
}
