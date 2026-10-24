// SPDX-License-Identifier: Apache-2.0
import {
  type Finding,
  focusedTests as findFocused,
  skippedTests as findSkipped,
  isTestFile,
  type Mark,
  translator,
  unreferencedTodos,
} from "@baquia-dev/specty-core";
import type { CheckContext, CheckDefinition } from "./provider";

/**
 * Checks that look for markers line by line, in any language: what `markers.ts` of the core
 * finds, in the run's files, on the lines the change adds.
 */
async function scan(
  context: CheckContext,
  options: {
    readonly testsOnly: boolean;
    readonly find: (text: string) => readonly Mark[];
    readonly message: (marker: string) => string;
  },
): Promise<{ readonly findings: readonly Finding[] }> {
  const files = options.testsOnly ? context.files.filter(isTestFile) : context.files;
  const findings = await Promise.all(
    files.map(async (path): Promise<Finding[]> => {
      const text = await context.read(path);
      if (text === undefined) return [];
      const added = context.added(path);
      return options
        .find(text)
        .filter((mark) => added === undefined || added.has(mark.line))
        .map((mark) => ({ path, line: mark.line, message: options.message(mark.marker) }));
    }),
  );
  return { findings: findings.flat() };
}

/** A test that runs alone leaves the others out of the run. */
export const focusedTests: CheckDefinition = {
  id: "focused-tests",
  run(context) {
    const t = translator(context.session.lang);
    return scan(context, {
      testsOnly: true,
      find: findFocused,
      message: (marker) => t(`test enfocado: ${marker}`, `focused test: ${marker}`),
    });
  },
};

/** A test switched off by a marker no longer guards anything. */
export const skippedTests: CheckDefinition = {
  id: "skipped-tests",
  run(context) {
    const t = translator(context.session.lang);
    return scan(context, {
      testsOnly: true,
      find: findSkipped,
      message: (marker) => t(`test omitido: ${marker}`, `skipped test: ${marker}`),
    });
  },
};

/** Pending work points to the issue that tracks it, by `checks.todo`. */
export const todo: CheckDefinition = {
  id: "todo",
  run(context) {
    const t = translator(context.session.lang);
    return scan(context, {
      testsOnly: false,
      find: (text) => unreferencedTodos(text, context.session.config.checks.todo),
      message: (marker) =>
        t(`${marker} sin referencia a un issue`, `${marker} without an issue reference`),
    });
  },
};
