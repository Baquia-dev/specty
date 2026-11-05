// SPDX-License-Identifier: Apache-2.0
import type { TestTime } from "../checks/junit";
import type { Lang } from "../i18n";
import { translator } from "./text";

/** The slow tests the note of `accept` names; how many more there are goes after them. */
const SHOWN = 5;

/** What `test-time` says of a slow test, after its file: its name, its time and the limit. */
export function slowTestMessage(
  test: Pick<TestTime, "name" | "ms">,
  maxMs: number,
  lang: Lang,
): string {
  const t = translator(lang);
  const took = seconds(test.ms, lang);
  const limit = seconds(maxMs, lang);
  return t(
    `«${test.name}» tarda ${took} (más de ${limit})`,
    `«${test.name}» takes ${took} (over ${limit})`,
  );
}

/**
 * The slow tests a full verification left, the longest first, as the note of `accept` shows
 * them: how many there are, the first five with their file and how many more; nothing without
 * any.
 */
export function slowTestLines(tests: readonly TestTime[], maxMs: number, lang: Lang): string[] {
  if (tests.length === 0) return [];
  const t = translator(lang);
  const limit = seconds(maxMs, lang);
  const more = tests.length - SHOWN;
  return [
    tests.length === 1
      ? t(`Un test tarda más de ${limit}:`, `1 test takes over ${limit}:`)
      : t(
          `${tests.length} tests tardan más de ${limit}:`,
          `${tests.length} tests take over ${limit}:`,
        ),
    ...tests.slice(0, SHOWN).map((test) => {
      const file = test.path === undefined ? "" : `${test.path} `;
      return `${file}«${test.name}»: ${seconds(test.ms, lang)}`;
    }),
    ...(more <= 0
      ? []
      : [
          more === 1
            ? t("Otro test lento.", "1 more slow test.")
            : t(`Otros ${more} tests lentos.`, `${more} more slow tests.`),
        ]),
  ];
}

/** `2,6 s` or `2.6 s`: to a tenth of a second, without it when it is zero. */
function seconds(ms: number, lang: Lang): string {
  const tenths = Math.round(ms / 100);
  const value =
    tenths % 10 === 0
      ? String(tenths / 10)
      : (tenths / 10).toFixed(1).replace(".", translator(lang)(",", "."));
  return `${value} s`;
}
