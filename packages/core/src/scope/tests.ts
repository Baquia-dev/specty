// SPDX-License-Identifier: Apache-2.0
import { globBase, isGlob } from "../glob";
import { basename, dirname, isWithin } from "../paths";

const TEST_NAME = [
  /\.(?:test|spec)\.[^/]+$/i,
  /_test\.[^/]+$/i,
  /(?:^|\/)test_[^/]+\.py$/i,
  /(?:Test|Tests|Spec|IT)\.(?:java|kt|kts|cs|scala|swift|groovy)$/,
  /\.snap$/,
];

const TEST_DIRS: ReadonlySet<string> = new Set([
  "test",
  "tests",
  "__tests__",
  "__snapshots__",
  "spec",
  "specs",
  "integration_test",
]);

const MIRROR_ROOTS: ReadonlySet<string> = new Set([
  "test",
  "tests",
  "spec",
  "specs",
  "integration_test",
]);
// `main` is Maven and Gradle's: `src/test/java/x` → `src/main/java/x`.
const SOURCE_ROOTS: readonly string[] = ["lib", "src", "app", "main", ""];
const SWIFT_TESTS = "Tests";

/** True for test files by name (`*.test.ts`, `*_test.dart`…) or location (`test/`, `__tests__/`…). */
export function isTestFile(path: string): boolean {
  if (TEST_NAME.some((pattern) => pattern.test(path))) return true;
  return dirname(path)
    .split("/")
    .some((segment) => TEST_DIRS.has(segment));
}

/**
 * True when `path` is a test next to, or mirroring, a path in scope:
 * `src/x/__tests__/a.test.ts`, `lib/x/a_test.go`, `test/x/a_test.dart` for `lib/x/a.dart`.
 */
export function isImplicitTest(path: string, scope: readonly string[]): boolean {
  if (!isTestFile(path)) return false;
  const candidates = subjectDirectories(path);
  return scope.some((pattern) => {
    if (!isGlob(pattern)) return candidates.includes(dirname(pattern));
    const base = globBase(pattern);
    return candidates.some((candidate) => isWithin(candidate, base));
  });
}

/**
 * True when `path` is a test of a path in `scope`, as `fix-tests` asks: an implicit test that,
 * right under the root of its mirror folder (`tests/cart.rs`, `test/cart_test.dart`), also has
 * the name of the file, because that root mirrors the whole source root. A glob in scope covers
 * a whole folder, so any test of it counts.
 */
export function isTestOf(path: string, scope: readonly string[]): boolean {
  const byName = atMirrorRoot(testDirectory(path));
  return scope.some(
    (pattern) =>
      isImplicitTest(path, [pattern]) &&
      (!byName || isGlob(pattern) || subjectName(pattern) === subjectName(path)),
  );
}

// The marks of a test in its name: `test_cart`, `cart_test`, `cart-spec`, `CartTests`, `CartIT`.
const TEST_AFFIXES = /^test_|[_-](?:test|spec)$|(?:Tests?|Spec|IT)$/;

/** `cart` for `src/cart.rs`, `tests/test_cart.py`, `test/cart_test.dart` and `CartTests.swift`. */
function subjectName(path: string): string {
  const stem = basename(path).split(".")[0] ?? "";
  return stem.replace(TEST_AFFIXES, "").toLowerCase();
}

/** Directories whose code a test file can be testing. */
function subjectDirectories(path: string): string[] {
  const trimmed = testDirectory(path);
  return [trimmed.join("/"), ...mirrored(trimmed), ...swiftPackageMirrored(trimmed)];
}

/** The segments of a test's folder, without the `__tests__` and `__snapshots__` it sits in. */
function testDirectory(path: string): readonly string[] {
  const segments = dirname(path)
    .split("/")
    .filter((segment) => segment.length > 0);
  return dropTrailing(segments, new Set(["__tests__", "__snapshots__"]));
}

/** True for a folder that is the root of a mirror: `tests`, `packages/x/test`, `Tests/ShopTests`. */
function atMirrorRoot(segments: readonly string[]): boolean {
  const mirror = mirrorRoot(segments);
  const target = swiftTestTarget(segments);
  return (
    (mirror >= 0 && mirror === segments.length - 1) ||
    (target >= 0 && target === segments.length - 2)
  );
}

function mirrorRoot(segments: readonly string[]): number {
  return segments.findIndex((segment) => MIRROR_ROOTS.has(segment));
}

/** The mirror root may be nested, as in a monorepo package: `packages/x/test/a` → `packages/x/src/a`. */
function mirrored(segments: readonly string[]): string[] {
  const mirror = mirrorRoot(segments);
  if (mirror < 0) return [];
  const prefix = segments.slice(0, mirror);
  const rest = segments.slice(mirror + 1);
  return SOURCE_ROOTS.map((source) => [...prefix, source, ...rest].filter(Boolean).join("/"));
}

function swiftTestTarget(segments: readonly string[]): number {
  return segments.findIndex(
    (segment, index) => segment === SWIFT_TESTS && isTestTarget(segments[index + 1]),
  );
}

/** SwiftPM's convention: `Tests/ShopTests/a` → `Sources/Shop/a`. */
function swiftPackageMirrored(segments: readonly string[]): string[] {
  const at = swiftTestTarget(segments);
  const target = segments[at + 1];
  if (at < 0 || target === undefined) return [];
  const module = target.slice(0, -SWIFT_TESTS.length);
  return [[...segments.slice(0, at), "Sources", module, ...segments.slice(at + 2)].join("/")];
}

function isTestTarget(segment: string | undefined): boolean {
  return (
    segment !== undefined && segment.length > SWIFT_TESTS.length && segment.endsWith(SWIFT_TESTS)
  );
}

function dropTrailing(segments: readonly string[], names: ReadonlySet<string>): readonly string[] {
  const last = segments.at(-1);
  return last !== undefined && names.has(last)
    ? dropTrailing(segments.slice(0, -1), names)
    : segments;
}
