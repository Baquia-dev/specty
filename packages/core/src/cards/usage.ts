// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { ChangeUsage } from "../usage";
import { translator } from "./text";

// A change's consumption in words (formats.md §4, `change.usage`): in its closing and in its audit.

type T = (es: string, en: string) => string;

/** The line of the closing: the change's tokens, its calls and, when known, its cost. */
export function usageLine(usage: ChangeUsage, lang: Lang): string {
  const t = translator(lang);
  return `${t("Consumo del cambio, según ccusage: ", "The change's usage, per ccusage: ")}${usageWords(usage, t)}.`;
}

/**
 * The closing's advice when the agent's session carries much context: a fresh one for the next
 * change, since every step reads all of it again.
 */
export function freshSessionLine(context: number, lang: Lang): string {
  const t = translator(lang);
  const tokens = grouped(Math.round(context / 1000) * 1000, t);
  return t(
    `Para el siguiente cambio conviene una sesión nueva del agente (en Claude Code, \`/clear\`): esta ya lleva unos ${tokens} tokens de contexto, y cada paso los vuelve a leer.`,
    `For the next change, start a fresh agent session (in Claude Code, \`/clear\`): this one already carries about ${tokens} tokens of context, which every step reads again.`,
  );
}

/** Tokens, calls and cost, as the closing and the audit say them. */
export function usageWords(usage: ChangeUsage, t: T): string {
  const tokens = usage.input + usage.output + usage.cacheWrite + usage.cacheRead;
  const calls =
    usage.calls === 1
      ? t("1 llamada", "1 call")
      : t(`${usage.calls} llamadas`, `${usage.calls} calls`);
  const cost = usage.cost === undefined ? "" : `, ${decimal(usage.cost, 2, t)} USD`;
  return `${amount(tokens, t)} tokens ${t("en", "in")} ${calls}${cost}`;
}

/** The consumption an event of the audit keeps, when its data is one. */
export function usageOf(data: Readonly<Record<string, unknown>>): ChangeUsage | undefined {
  const count = (key: string) => {
    const value = data[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  };
  const [calls, input, output, cacheWrite, cacheRead] = [
    count("calls"),
    count("input"),
    count("output"),
    count("cacheWrite"),
    count("cacheRead"),
  ];
  if (
    calls === undefined ||
    input === undefined ||
    output === undefined ||
    cacheWrite === undefined ||
    cacheRead === undefined
  )
    return undefined;
  const cost = count("cost");
  const usage = { calls, input, output, cacheWrite, cacheRead };
  return cost === undefined ? usage : { ...usage, cost };
}

/** What init asks a person whose Node project has no ccusage: `command` adds it. */
export function ccusageQuestion(command: string, lang: Lang): string {
  return translator(lang)(
    `¿Medir lo que consume cada cambio? Añade ccusage como dependencia de desarrollo con \`${command}\`.`,
    `Measure what each change consumes? It adds ccusage as a development dependency with \`${command}\`.`,
  );
}

export function ccusageAddedLine(lang: Lang): string {
  return translator(lang)(
    "ccusage añadido como dependencia de desarrollo: al cerrar cada cambio, Specty dice lo que consumió.",
    "ccusage added as a development dependency: when each change closes, Specty tells what it consumed.",
  );
}

/** Adding ccusage failed: the command to run later. */
export function ccusageFailedWarning(command: string, lang: Lang): string {
  return translator(lang)(
    `No se pudo añadir ccusage: ejecuta \`${command}\` para que Specty mida el consumo de cada cambio.`,
    `ccusage could not be added: run \`${command}\` for Specty to measure what each change consumes.`,
  );
}

/** How to install ccusage, when init does not: an agent runs it, or the project is not Node's. */
export function ccusageHint(command: string, lang: Lang): string {
  return translator(lang)(
    `Para que Specty mida el consumo de cada cambio, instala ccusage: \`${command}\`.`,
    `For Specty to measure what each change consumes, install ccusage: \`${command}\`.`,
  );
}

/** Millions with two decimals, thousands with one, or whole. */
function amount(tokens: number, t: T): string {
  if (tokens >= 1e6) return decimal(tokens / 1e6, 2, t) + t(" M", "M");
  if (tokens >= 1e3) return decimal(tokens / 1e3, 1, t) + t(" mil", "k");
  return String(tokens);
}

/** A whole number with its thousands apart: `620.000` or `620,000`. */
function grouped(value: number, t: T): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, t(".", ","));
}

function decimal(value: number, digits: number, t: T): string {
  return value.toFixed(digits).replace(".", t(",", "."));
}
