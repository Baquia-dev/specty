// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import type { ResolvedConfig } from "../schema/config";
import { classifyPath, scopeRulesFrom } from "../scope/scope";
import { isTestFile } from "../scope/tests";

/**
 * Why a governed path may not change in the testing phase (ADR 0014): only the tests of the
 * change's `files` are open, the listed ones and the implicit ones next to them, never the code
 * they test. Undefined when the path is open.
 */
export function testingDenial(
  path: string,
  files: readonly string[],
  config: ResolvedConfig,
  lang: Lang,
  command: string,
): { readonly reason: string; readonly next: string } | undefined {
  const verdict = classifyPath(path, {
    taskFiles: files,
    extras: [],
    rules: scopeRulesFrom(config),
  });
  if (isTestFile(path) && (verdict === "declared" || verdict === "implicit-test")) return undefined;
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  return {
    reason: t(
      `El cambio está en la fase de tests: solo se escriben los tests de sus archivos, y \`${path}\` no es uno de ellos.`,
      `The change is in the testing phase: only the tests of its files are written, and \`${path}\` is not one of them.`,
    ),
    next: t(
      `escribe solo los tests de los criterios y envíalos con \`${command} propose\`; el código va después, cuando la persona los apruebe.`,
      `write only the tests of the criteria and send them with \`${command} propose\`; the code comes after, once the person approves them.`,
    ),
  };
}

/**
 * Why an approved test may not be written or deleted: the tests the person approved are the
 * contract (ADR 0014), and the implementation's own tests go in new files.
 */
export function lockedDenial(
  path: string,
  lang: Lang,
): { readonly reason: string; readonly next: string } {
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  return {
    reason: t(
      `\`${path}\` es un test aprobado y está bloqueado: los tests que aprobó la persona son el contrato.`,
      `\`${path}\` is an approved test and it is locked: the tests the person approved are the contract.`,
    ),
    next: t(
      "no lo cambies; si crees que el test está mal, para y explícaselo al usuario. Los tests nuevos van en archivos nuevos.",
      "do not change it; if you think the test is wrong, stop and explain it to the user. New tests go in new files.",
    ),
  };
}
