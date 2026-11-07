// SPDX-License-Identifier: Apache-2.0
// How the panel's sections write a day, a share and an amount in dollars, in the page's language.
import type { Lang } from "@baquia-dev/specty-core/light";

/** A local day, YYYY-MM-DD, as «9 oct» or «Oct 9». */
export function shortDay(day: string, lang: Lang): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(
    new Date(year, month - 1, date),
  );
}

/** A share, 0.125, as «12,5 %» or «12.5%», with `digits` decimals at most. */
export function percent(value: number, lang: Lang, digits: number): string {
  return new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: digits }).format(
    value,
  );
}

/** An amount in dollars, as «12,50 US$» or «$12.50». */
export function usd(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang, { style: "currency", currency: "USD" }).format(value);
}
