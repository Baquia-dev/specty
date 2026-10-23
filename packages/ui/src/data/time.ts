// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "@baquia-dev/specty-core";

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "hace 12 min" / "12 min ago"; "ahora" under a minute. */
export function relativeTime(iso: string, now: number, lang: Lang): string {
  const elapsed = now - Date.parse(iso);
  const format = new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "short" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(elapsed) >= size) return format.format(-Math.round(elapsed / size), unit);
  }
  return format.format(0, "minute");
}
