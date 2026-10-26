// SPDX-License-Identifier: Apache-2.0
import { suppressions as findSuppressions, translator } from "@baquia-dev/specty-core";
import { scan } from "./markers";
import type { CheckDefinition, Provider } from "./provider";

/**
 * The comments and annotations that silence a compiler, a type checker or a linter (ADR 0012):
 * the core's catalog, by the extension of each file, on the lines the change adds. Dart's belong
 * to `dart-strict`, so a repository whose only stack is Dart does not get this check.
 */
const suppressions: CheckDefinition = {
  id: "suppressions",
  run(context) {
    const t = translator(context.session.lang);
    return scan(context, {
      testsOnly: false,
      find: (text, path) => findSuppressions(path, text),
      message: (marker) => t(`supresión: ${marker}`, `suppression: ${marker}`),
    });
  },
};

export const suppressionsProvider: Provider = {
  id: "suppressions",
  applies: (stacks) => stacks.some((stack) => stack.language !== "dart"),
  checks: [suppressions],
};
