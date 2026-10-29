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

/** Millions with two decimals, thousands with one, or whole. */
function amount(tokens: number, t: T): string {
  if (tokens >= 1e6) return decimal(tokens / 1e6, 2, t) + t(" M", "M");
  if (tokens >= 1e3) return decimal(tokens / 1e3, 1, t) + t(" mil", "k");
  return String(tokens);
}

function decimal(value: number, digits: number, t: T): string {
  return value.toFixed(digits).replace(".", t(",", "."));
}
