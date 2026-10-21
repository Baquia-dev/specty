// SPDX-License-Identifier: Apache-2.0
import picomatch from "picomatch/posix";

type Matcher = (path: string) => boolean;

const GLOB_CHARS = /[*?[{]/;
const matchers = new Map<string, Matcher>();

/** True when the pattern uses glob syntax; otherwise it is a literal path. */
export function isGlob(pattern: string): boolean {
  return GLOB_CHARS.test(pattern);
}

/** Matches a POSIX path against a literal path or a glob (dotfiles included). */
export function matchesPattern(path: string, pattern: string): boolean {
  return isGlob(pattern) ? compile(pattern)(path) : path === pattern;
}

export function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesPattern(path, pattern));
}

/** Static directory prefix of a pattern: `lib/features/**` → `lib/features`. */
export function globBase(pattern: string): string {
  return isGlob(pattern) ? picomatch.scan(pattern).base : pattern;
}

function compile(pattern: string): Matcher {
  const cached = matchers.get(pattern);
  if (cached !== undefined) return cached;
  // Parentheses are literal in paths such as Next.js route groups, `app/(auth)/**`.
  const matcher = picomatch(pattern.replace(/[()]/g, "\\$&"), { dot: true });
  matchers.set(pattern, matcher);
  return matcher;
}
