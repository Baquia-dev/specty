// SPDX-License-Identifier: Apache-2.0

/**
 * Own-property lookup. User text such as `constructor` or `toString` must never reach
 * `Object.prototype` through a plain `table[key]` or `key in table`.
 */
export function lookup<V>(table: Readonly<Record<string, V>>, key: string): V | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}
