// SPDX-License-Identifier: Apache-2.0

/** A criterion's condition and result. */
export interface Scenario {
  readonly when: string;
  readonly then: string;
}

/**
 * A criterion `CUANDO … ENTONCES …` (or `WHEN … THEN …`) split into its condition and its
 * result; undefined when it does not have that form, and the formats then keep it whole.
 */
export function scenarioOf(text: string): Scenario | undefined {
  const [, when, then] =
    /^\s*(?:CUANDO|WHEN)\s+([\s\S]+?)\s+(?:ENTONCES|THEN)\s+([\s\S]+?)\s*$/.exec(text) ?? [];
  return when === undefined || then === undefined ? undefined : { when, then };
}
