// SPDX-License-Identifier: Apache-2.0
import type { Coverage } from "./coverage-reports";

/**
 * The coverage of the lines a change adds (`diff-coverage`): of the lines it adds that some
 * report measured, how many some test ran, and the stretches no test ran. A line no report
 * measures (a comment, a brace, a file never instrumented) counts neither way.
 */

/** A file of the run with the lines it adds; every line counts without them. */
export interface ChangedLines {
  readonly path: string;
  readonly lines?: ReadonlySet<number>;
}

/** Added lines no test ran, from `from` to `to`, with no covered measured line between them. */
export interface CoverageGap {
  readonly path: string;
  readonly from: number;
  readonly to: number;
}

export interface ChangedCoverage {
  readonly measured: number;
  readonly covered: number;
  readonly gaps: readonly CoverageGap[];
}

export function changedCoverage(
  reports: readonly Coverage[],
  changed: readonly ChangedLines[],
): ChangedCoverage {
  let measured = 0;
  let covered = 0;
  const gaps: CoverageGap[] = [];
  for (const file of [...changed].sort((a, b) => a.path.localeCompare(b.path))) {
    const lines = merged(reports, file.path);
    const added = [...lines.keys()]
      .filter((line) => file.lines === undefined || file.lines.has(line))
      .sort((a, b) => a - b);
    let open: { from: number; to: number } | undefined;
    for (const line of added) {
      measured++;
      if (lines.get(line) === true) {
        covered++;
        if (open !== undefined) gaps.push({ path: file.path, ...open });
        open = undefined;
      } else open = { from: open?.from ?? line, to: line };
    }
    if (open !== undefined) gaps.push({ path: file.path, ...open });
  }
  return { measured, covered, gaps };
}

/** The lines of `path` in every report, each one run when it ran in any of them. */
function merged(reports: readonly Coverage[], path: string): ReadonlyMap<number, boolean> {
  const lines = new Map<number, boolean>();
  for (const report of reports) {
    for (const [line, ran] of report.get(match(report, path) ?? "") ?? []) {
      lines.set(line, lines.get(line) === true || ran);
    }
  }
  return lines;
}

/**
 * The report's name for `path`: the same path, or the longest one that ends where `path` ends,
 * or where `path` ends with it, at a folder boundary (another checkout, a Go module, a Java
 * source folder).
 */
function match(report: Coverage, path: string): string | undefined {
  if (report.has(path)) return path;
  let best: string | undefined;
  for (const name of report.keys()) {
    const fits = name.endsWith(`/${path}`) || path.endsWith(`/${name}`);
    if (fits && (best === undefined || name.length > best.length)) best = name;
  }
  return best;
}
