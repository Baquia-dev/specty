// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  changeUsage,
  type ModelCost,
  modelPrices,
  type TokenPrices,
  type UsageEntry,
} from "../src";

const MODEL = "claude-opus-5-5";
/** Opus' prices in this repository's sessions, in USD per million tokens. */
const OPUS: TokenPrices = { input: 4, output: 20, cacheWrite: 8, cacheRead: 0.2 };
/** Tokens of each kind: input, output, cache write and cache read. */
type Tokens = readonly [number, number, number, number];

/** A session of `model` as ccusage breaks it down, priced at `prices`. */
function session(tokens: Tokens, prices: TokenPrices = OPUS, model = MODEL): ModelCost {
  const [inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens] = tokens;
  const cost =
    (inputTokens * prices.input +
      outputTokens * prices.output +
      cacheCreationTokens * prices.cacheWrite +
      cacheReadTokens * prices.cacheRead) /
    1e6;
  return {
    modelName: model,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    cost,
  };
}

/** A model call as ccusage lists it. */
function call(timestamp: string, tokens: Tokens, model = MODEL): UsageEntry {
  const [inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens] = tokens;
  return { timestamp, model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens };
}

const SESSIONS: readonly ModelCost[] = [
  session([1000, 2000, 30_000, 500_000]),
  session([500, 8000, 10_000, 2_000_000]),
  session([3000, 1000, 90_000, 100_000]),
  session([100, 50_000, 5000, 9_000_000]),
];
const SINCE = "2026-10-29T10:00:00.000Z";

describe("the prices of each model", () => {
  it("AC2: are the ones that explain the cost ccusage gives each session", () => {
    const prices = modelPrices(SESSIONS).get(MODEL);
    expect(prices?.input).toBeCloseTo(4, 6);
    expect(prices?.output).toBeCloseTo(20, 6);
    expect(prices?.cacheWrite).toBeCloseTo(8, 6);
    expect(prices?.cacheRead).toBeCloseTo(0.2, 6);
  });

  it("AC2: are none with fewer than four sessions, or when a session's cost does not fit", () => {
    expect(modelPrices(SESSIONS.slice(0, 3)).has(MODEL)).toBe(false);
    // A fifth session a dollar off: no prices explain every session to the cent.
    const fifth = session([2000, 3000, 20_000, 700_000]);
    expect(modelPrices([...SESSIONS, { ...fifth, cost: fifth.cost + 1 }]).has(MODEL)).toBe(false);
    // Each model on its own: one with a single session does not take the other's prices away.
    const other = session(
      [10, 20, 30, 40],
      { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
      "otro-modelo",
    );
    const both = modelPrices([...SESSIONS, other]);
    expect(both.has(MODEL)).toBe(true);
    expect(both.has("otro-modelo")).toBe(false);
  });
});

describe("the prices, among many sessions", () => {
  /**
   * Sessions at Opus' prices, as big as this repository's (tens of dollars), with tokens that vary
   * each its own way.
   */
  const priced = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      session([
        1000 + ((index * index * 31) % 6000),
        100_000 + ((index * 7919 * 13) % 2_900_000),
        500_000 + ((index * index * index * 13) % 9_500_000),
        50_000_000 + ((index * 104_729 * 97) % 1_650_000_000),
      ]),
    );
  /** A session ccusage priced otherwise: `off` dollars away from Opus' prices. */
  const stray = (tokens: Tokens, off: number) => {
    const at = session(tokens);
    return { ...at, cost: at.cost + off };
  };
  const strays = [
    stray([2900, 2_026_400, 6_558_400, 695_736_800], 3.85),
    stray([2100, 1_076_700, 3_112_700, 506_822_700], 1.03),
    stray([1500, 900_000, 2_000_000, 300_000_000], 2),
  ];

  it("leave out a few sessions that ccusage priced otherwise, up to a tenth", () => {
    // This repository's report: 34 sessions at Opus' prices and 2 that are not.
    const prices = modelPrices([...priced(34), ...strays.slice(0, 2)]).get(MODEL);
    expect(prices?.input).toBeCloseTo(4, 4);
    expect(prices?.output).toBeCloseTo(20, 6);
    expect(prices?.cacheWrite).toBeCloseTo(8, 6);
    expect(prices?.cacheRead).toBeCloseTo(0.2, 6);
    // Three of twenty are more than a tenth: no prices.
    expect(modelPrices([...priced(17), ...strays]).has(MODEL)).toBe(false);
  });
});

describe("a change's consumption", () => {
  it("AC1: adds up the calls made since the change began, and their cost", () => {
    const usage = changeUsage(
      [
        call("2026-10-29T09:59:59.000Z", [999, 999, 999, 999]),
        call("2026-10-29T10:01:00.000Z", [10, 500, 2000, 100_000]),
        call("2026-10-29T10:02:00.000Z", [5, 300, 1000, 120_000]),
      ],
      SINCE,
      new Map([[MODEL, OPUS]]),
    );
    expect(usage).toMatchObject({
      calls: 2,
      input: 15,
      output: 800,
      cacheWrite: 3000,
      cacheRead: 220_000,
    });
    expect(usage?.cost).toBeCloseTo(0.08406, 8);
  });

  it("AC2: goes without a cost when a model of its calls has no prices, and is none without calls", () => {
    const mixed = changeUsage(
      [
        call("2026-10-29T10:01:00.000Z", [1, 2, 3, 4]),
        call("2026-10-29T10:02:00.000Z", [1, 2, 3, 4], "otro-modelo"),
      ],
      SINCE,
      new Map([[MODEL, OPUS]]),
    );
    expect(mixed).toMatchObject({ calls: 2, input: 2, output: 4, cacheWrite: 6, cacheRead: 8 });
    expect(mixed).not.toHaveProperty("cost");
    const before = [call("2026-10-29T09:00:00.000Z", [1, 2, 3, 4])];
    expect(changeUsage(before, SINCE, new Map([[MODEL, OPUS]]))).toBeUndefined();
  });
});
