// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { type Finding, fileSize, translator } from "@baquia-dev/specty-core";
import { readText } from "../io/files";
import type { CheckDefinition, Provider } from "./provider";

/** Lines of code of each file, by the `lines` rule `task done` also applies, in any language. */
const maxLines: CheckDefinition = {
  id: "max-lines",
  async run({ session, files }) {
    const t = translator(session.lang);
    const findings = await Promise.all(
      files.map(async (path): Promise<Finding[]> => {
        const text = await readText(join(session.root, path));
        const size = text === undefined ? undefined : fileSize(path, text, session.config);
        if (size === undefined) return [];
        const { lines, warn, fail } = size;
        if (fail !== false && lines > fail) {
          return [
            {
              path,
              message: t(
                `${lines} líneas de código (máximo ${fail})`,
                `${lines} lines of code (max ${fail})`,
              ),
            },
          ];
        }
        if (lines <= warn) return [];
        const message = t(
          `${lines} líneas de código (aviso a partir de ${warn})`,
          `${lines} lines of code (warning past ${warn})`,
        );
        return [{ path, message, severity: "warning" }];
      }),
    );
    return { findings: findings.flat() };
  },
};

/** The checks that apply to every stack. */
export const commonProvider: Provider = {
  id: "common",
  applies: () => true,
  checks: [maxLines],
};
