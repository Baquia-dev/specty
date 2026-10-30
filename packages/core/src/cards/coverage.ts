// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { translator } from "./text";
import type { CoverageView } from "./view";

/**
 * The coverage of the lines the change adds, as the acceptance shows it: one line with the
 * percentage, rounded down as the `diff-coverage` check does; below `warn`, also the threshold and
 * the stretches no test ran, with how many more there are.
 */
export function coverageLines(coverage: CoverageView, lang: Lang): string[] {
  const t = translator(lang);
  const { measured, covered, warn } = coverage;
  const percent = Math.floor((covered / measured) * 100);
  const lines =
    measured === 1
      ? t("de la línea que añade el cambio", "of the line the change adds")
      : t(
          `de las ${measured} líneas que añade el cambio`,
          `of the ${measured} lines the change adds`,
        );
  const ran = t(
    `Los tests ejecutan el ${percent} % ${lines}`,
    `The tests run ${percent}% ${lines}`,
  );
  if (percent >= warn) return [`${ran}.`];
  const more = coverage.stretches - coverage.gaps.length;
  return [
    `${ran}${t(`, por debajo del ${warn} %.`, `, below ${warn}%.`)}`,
    ...coverage.gaps.map(({ path, from, to }) => {
      const where = from === to ? `${path}:${from}` : `${path}:${from}-${to}`;
      return t(`Sin ejecutar: ${where}`, `Not run: ${where}`);
    }),
    ...(more <= 0
      ? []
      : [
          more === 1
            ? t("Otro tramo sin ejecutar.", "1 more stretch not run.")
            : t(`Otros ${more} tramos sin ejecutar.`, `${more} more stretches not run.`),
        ]),
  ];
}
