// SPDX-License-Identifier: Apache-2.0
import { type Finding, longFiles, type SizedFile, translator } from "@baquia-dev/specty-core";
import type { CheckDefinition } from "./provider";

/**
 * Lines of code of each file, by the `lines` rule `task done` also applies, in any language: it
 * fails only on a file the run takes past the maximum, from where the mode starts (the base with
 * `--changed`, HEAD with `--staged`); with `--all` there is no start, so every file counts.
 */
export const maxLines: CheckDefinition = {
  id: "max-lines",
  async run(context) {
    const t = translator(context.session.lang);
    const files = await Promise.all(
      context.files.map(async (path): Promise<SizedFile[]> => {
        const [after, before] = await Promise.all([context.read(path), context.before(path)]);
        if (after === undefined) return [];
        return [before === undefined ? { path, after } : { path, before, after }];
      }),
    );
    const findings = longFiles(files.flat(), context.session.config).map(
      ({ path, lines, limit, severity }): Finding =>
        severity === "error"
          ? {
              path,
              message: t(
                `${lines} líneas de código (máximo ${limit})`,
                `${lines} lines of code (max ${limit})`,
              ),
            }
          : {
              path,
              message: t(
                `${lines} líneas de código (aviso a partir de ${limit})`,
                `${lines} lines of code (warning past ${limit})`,
              ),
              severity: "warning",
            },
    );
    return { findings };
  },
};
