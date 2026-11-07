// SPDX-License-Identifier: Apache-2.0
import type { Translate } from "./text";

// How `specty stats` writes its figures (ARCHITECTURE §6): durations, shares and dollars as the
// panel of `specty ui` says them, and its tables with their columns lined up.

/** The rows of a table, their columns apart: the first to the left, the others to the right. */
export function aligned(rows: readonly (readonly string[])[]): string[] {
  const widths = (rows[0] ?? []).map((_, column) =>
    Math.max(...rows.map((row) => (row[column] ?? "").length)),
  );
  return rows.map((row) =>
    row
      .map((cell, column) =>
        column === 0 ? cell.padEnd(widths[column] ?? 0) : cell.padStart(widths[column] ?? 0),
      )
      .join("  "),
  );
}

/** A share from 0 to 1, with a decimal when it has one: `92,5 %` or `92.5%`. */
export function share(value: number, t: Translate): string {
  const tenths = Math.round(value * 1000) / 10;
  const number = Number.isInteger(tenths) ? String(tenths) : decimal(tenths, 1, t);
  return t(`${number} %`, `${number}%`);
}

/** US dollars, with two decimals: `12,30 USD` or `12.30 USD`. */
export function usd(value: number, t: Translate): string {
  return `${decimal(value, 2, t)} USD`;
}

function decimal(value: number, digits: number, t: Translate): string {
  return value.toFixed(digits).replace(".", t(",", "."));
}

/** Milliseconds as the panel says them: seconds, minutes, hours and minutes, or days and hours. */
export function span(ms: number, t: Translate): string {
  if (ms < 1_000) return t("menos de 1 s", "under 1 s");
  if (ms < 60_000) return `${Math.round(ms / 1_000)} s`;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1_440) {
    const rest = minutes % 60;
    return rest === 0
      ? `${Math.floor(minutes / 60)} h`
      : `${Math.floor(minutes / 60)} h ${rest} min`;
  }
  const hours = Math.round(ms / 3_600_000);
  const rest = hours % 24;
  return rest === 0 ? `${Math.floor(hours / 24)} d` : `${Math.floor(hours / 24)} d ${rest} h`;
}
