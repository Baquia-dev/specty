// SPDX-License-Identifier: Apache-2.0

/** A criterion's condition (its WHEN) and result (its THEN). */
export interface Scenario {
  readonly condition: string;
  readonly result: string;
}

/**
 * A criterion `CUANDO … ENTONCES …` (or `WHEN … THEN …`) split into its condition and its
 * result; undefined when it does not have that form, and the formats then keep it whole.
 */
export function scenarioOf(text: string): Scenario | undefined {
  const [, condition, result] =
    /^\s*(?:CUANDO|WHEN)\s+([\s\S]+?)\s+(?:ENTONCES|THEN)\s+([\s\S]+?)\s*$/.exec(text) ?? [];
  return condition === undefined || result === undefined ? undefined : { condition, result };
}
