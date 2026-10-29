// SPDX-License-Identifier: Apache-2.0
// What a change consumed (formats.md §4, `change.usage`), from what ccusage reads in the agents'
// logs: the calls of the sessions that worked on it, and each model's prices, which ccusage does
// not give per call but fixes in the cost of every session.

/** One model call, as `ccusage <source> session --id <id> --json` lists it. */
export interface UsageEntry {
  readonly timestamp: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationTokens: number;
  readonly cacheReadTokens: number;
}

/** A session's tokens and cost for one model: a row of `modelBreakdowns` in ccusage's report. */
export interface ModelCost {
  readonly modelName: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationTokens: number;
  readonly cacheReadTokens: number;
  readonly cost: number;
}

/** USD per million tokens of each kind. */
export interface TokenPrices {
  readonly input: number;
  readonly output: number;
  readonly cacheWrite: number;
  readonly cacheRead: number;
}

/**
 * What a change consumed: its model calls, the tokens of each kind and, when every model of its
 * calls has prices, its cost in USD.
 */
export interface ChangeUsage {
  readonly calls: number;
  readonly input: number;
  readonly output: number;
  readonly cacheWrite: number;
  readonly cacheRead: number;
  readonly cost?: number;
}

/** Millions of tokens of each kind: input, output, cache write and cache read. */
type Vector = readonly [number, number, number, number];
type Tokens = Omit<UsageEntry, "timestamp" | "model">;

/** The sessions a model needs: one per price. */
const ENOUGH = 4;
/** How far a session's cost may be from what the prices give. */
const CENT = 0.01;
/** Below this, a pivot of the scaled system is a zero: the sessions do not fix the prices. */
const SINGULAR = 1e-12;
/**
 * The share of a model's sessions that may fall outside its prices: ccusage prices a few of them
 * otherwise, by a cost their log already says or by a kind of cache write its report does not
 * tell apart. In this repository, 2 of 36.
 */
const STRAYS = 0.1;

/**
 * Each model's prices: those that explain, to the cent, the cost ccusage gives at least nine in
 * ten of its sessions. A model with fewer than four sessions, or whose costs no prices explain
 * (prices by tiers, say), has none.
 */
export function modelPrices(rows: readonly ModelCost[]): ReadonlyMap<string, TokenPrices> {
  const byModel = new Map<string, ModelCost[]>();
  for (const row of rows) byModel.set(row.modelName, [...(byModel.get(row.modelName) ?? []), row]);
  const prices = new Map<string, TokenPrices>();
  for (const [model, sessions] of byModel) {
    const fitted = fit(sessions);
    if (fitted !== undefined) prices.set(model, fitted);
  }
  return prices;
}

/**
 * What the calls made since `since` add up to, with their cost when every model of them has
 * prices; undefined without any call.
 */
export function changeUsage(
  entries: readonly UsageEntry[],
  since: string,
  prices: ReadonlyMap<string, TokenPrices>,
): ChangeUsage | undefined {
  const start = Date.parse(since);
  const calls = entries.filter((entry) => Date.parse(entry.timestamp) >= start);
  if (calls.length === 0) return undefined;
  const total = (tokens: (entry: UsageEntry) => number) => sum(calls.map(tokens));
  const usage = {
    calls: calls.length,
    input: total((entry) => entry.inputTokens),
    output: total((entry) => entry.outputTokens),
    cacheWrite: total((entry) => entry.cacheCreationTokens),
    cacheRead: total((entry) => entry.cacheReadTokens),
  };
  const costs = calls.map((entry) => {
    const price = prices.get(entry.model);
    return price === undefined ? undefined : costOf(millions(entry), price);
  });
  return costs.every((cost): cost is number => cost !== undefined)
    ? { ...usage, cost: sum(costs) }
    : usage;
}

/**
 * The prices that explain to the cent all the sessions but a tenth at most, or undefined. A fit
 * over every session would spread a stray's error over all of them, so each candidate solves four
 * sessions spread over the list exactly; the one that explains the most wins, and least squares
 * over those it explains gives the prices.
 */
function fit(sessions: readonly ModelCost[]): TokenPrices | undefined {
  if (sessions.length < ENOUGH) return undefined;
  let best: readonly ModelCost[] = [];
  for (const candidate of candidates(sessions)) {
    const explained = sessions.filter((session) => explains(candidate, session));
    if (explained.length > best.length) best = explained;
  }
  if (best.length < Math.max(ENOUGH, Math.ceil(sessions.length * (1 - STRAYS)))) return undefined;
  const prices = leastSquares(best);
  return prices !== undefined &&
    plausible(prices) &&
    best.every((session) => explains(prices, session))
    ? prices
    : undefined;
}

/**
 * The exact prices of four sessions spread over the list, one group from each session. Prices
 * below zero are none: four sessions can bend them until they explain one more by chance.
 */
function candidates(sessions: readonly ModelCost[]): TokenPrices[] {
  const step = Math.floor(sessions.length / ENOUGH);
  return sessions.flatMap((_, first) => {
    const group = [0, 1, 2, 3].flatMap((offset) => {
      const session = sessions[(first + offset * step) % sessions.length];
      return session === undefined ? [] : [session];
    });
    const prices = leastSquares(group);
    return prices !== undefined && plausible(prices) ? [prices] : [];
  });
}

/** Whether the prices can be prices: none below zero. */
function plausible(prices: TokenPrices): boolean {
  return [prices.input, prices.output, prices.cacheWrite, prices.cacheRead].every(
    (price) => price >= 0,
  );
}

/** Whether `prices` give the session's cost to the cent. */
function explains(prices: TokenPrices, session: ModelCost): boolean {
  return Math.abs(costOf(millions(session), prices) - session.cost) <= CENT;
}

/** The prices that best explain the sessions' costs, or undefined when they do not fix them. */
function leastSquares(sessions: readonly ModelCost[]): TokenPrices | undefined {
  if (sessions.length < ENOUGH) return undefined;
  const rows = sessions.map(millions);
  // Each column scaled to its largest value: cache reads run in billions, inputs in thousands.
  const scales = columns((column) => Math.max(...rows.map((row) => row[column])) || 1);
  const scaled = rows.map((row) => columns((column) => row[column] / scales[column]));
  const normal = columns((i) => columns((j) => sum(scaled.map((row) => row[i] * row[j]))));
  const right = columns((i) =>
    sum(scaled.map((row, index) => row[i] * (sessions[index]?.cost ?? 0))),
  );
  const solved = solve(normal, right);
  if (solved === undefined) return undefined;
  const [input, output, cacheWrite, cacheRead] = columns(
    (column) => solved[column] / scales[column],
  );
  return { input, output, cacheWrite, cacheRead };
}

/**
 * The solution of a 4×4 system, by Gaussian elimination with partial pivoting; undefined when it
 * is singular.
 */
function solve(matrix: readonly Vector[], right: Vector): Vector | undefined {
  let rows: readonly (readonly number[])[] = matrix.map((row, index) => [
    ...row,
    right[index] ?? 0,
  ]);
  for (let column = 0; column < 4; column++) {
    const pivoted = withPivot(rows, column);
    if (pivoted === undefined) return undefined;
    rows = eliminate(pivoted, column);
  }
  const solved = rows;
  return columns((column) => cell(solved[column], 4) / cell(solved[column], column));
}

/**
 * The rows with the one of largest value at `column`, among those from `column` down, moved to
 * `column`; undefined when that value is a zero.
 */
function withPivot(
  rows: readonly (readonly number[])[],
  column: number,
): readonly (readonly number[])[] | undefined {
  let best = column;
  for (let index = column + 1; index < rows.length; index++) {
    if (Math.abs(cell(rows[index], column)) > Math.abs(cell(rows[best], column))) best = index;
  }
  if (Math.abs(cell(rows[best], column)) < SINGULAR) return undefined;
  return rows.map((row, index) => {
    if (index === column) return rows[best] ?? row;
    return index === best ? (rows[column] ?? row) : row;
  });
}

/** The rows with a zero at `column` in every one but the pivot's. */
function eliminate(rows: readonly (readonly number[])[], column: number): readonly number[][] {
  const pivot = rows[column];
  return rows.map((row, index) => {
    if (index === column) return [...row];
    const factor = cell(row, column) / cell(pivot, column);
    return row.map((value, at) => value - factor * cell(pivot, at));
  });
}

/** A value of the system: its rows are always full. */
function cell(row: readonly number[] | undefined, column: number): number {
  return row?.[column] ?? 0;
}

function millions(tokens: Tokens): Vector {
  return [
    tokens.inputTokens / 1e6,
    tokens.outputTokens / 1e6,
    tokens.cacheCreationTokens / 1e6,
    tokens.cacheReadTokens / 1e6,
  ];
}

function costOf(vector: Vector, prices: TokenPrices): number {
  const [input, output, write, read] = vector;
  return (
    input * prices.input +
    output * prices.output +
    write * prices.cacheWrite +
    read * prices.cacheRead
  );
}

/** A vector of the four kinds of tokens, from its value at each column. */
function columns<T>(value: (column: 0 | 1 | 2 | 3) => T): readonly [T, T, T, T] {
  return [value(0), value(1), value(2), value(3)];
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
