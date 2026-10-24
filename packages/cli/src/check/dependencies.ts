// SPDX-License-Identifier: Apache-2.0
import {
  addedDependencies,
  type Finding,
  matchesAny,
  readsDependencies,
  translator,
} from "@baquia-dev/specty-core";
import type { LoadedPlan } from "./plan";
import type { CheckDefinition } from "./provider";

/**
 * Each dependency the diff adds to a manifest is one the plan allows: by name or glob in
 * `allowedDependencies`, which the approval covers like the rest of the spec.
 */
export function dependencies(plan: LoadedPlan): CheckDefinition {
  return {
    id: "dependencies",
    async run(context) {
      const t = translator(context.session.lang);
      const allowed = plan.spec.frontmatter.allowedDependencies ?? [];
      const findings = await Promise.all(
        context.files.filter(readsDependencies).map(async (path): Promise<Finding[]> => {
          const now = await context.read(path);
          if (now === undefined) return [];
          return addedDependencies(path, await context.before(path), now)
            .filter((dependency) => !matchesAny(dependency.name, allowed))
            .map((dependency) => ({
              path,
              ...(dependency.line !== undefined ? { line: dependency.line } : {}),
              message: t(
                `dependencia nueva sin permiso en la spec: ${dependency.name}`,
                `new dependency not allowed by the spec: ${dependency.name}`,
              ),
            }));
        }),
      );
      return { findings: findings.flat() };
    },
  };
}
