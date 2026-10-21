// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { hasBlock, headerOf, type Output, section, translator } from "@baquia-dev/specty-core";
import { detectProject } from "../detect/project";
import { hasGuard } from "../install/agents";
import { gitHooksInstalled } from "../install/git-hooks";
import { execute } from "../io/exec";
import { exists, readText } from "../io/files";
import { COMMAND, type Session } from "../session";

/** `specty doctor`: checks that the configuration and every hook are in place. */
export async function doctor(session: Session): Promise<Output> {
  const t = translator(session.lang);
  const { root, git } = session;
  const ok: string[] = [t(".specty/config.yaml es válido.", ".specty/config.yaml is valid.")];
  const problems: string[] = [];
  const check = (passed: boolean, good: string, bad: string) =>
    passed ? ok.push(good) : problems.push(bad);

  const agents = await readText(join(root, "AGENTS.md"));
  check(
    agents !== undefined && hasBlock(agents, "flow"),
    t("AGENTS.md tiene el bloque de flujo.", "AGENTS.md has the flow block."),
    t(
      `AGENTS.md no tiene el bloque de flujo: ejecuta \`${COMMAND} init\`.`,
      `AGENTS.md lacks the flow block: run \`${COMMAND} init\`.`,
    ),
  );
  check(
    await gitHooksInstalled(root, git),
    t("Hooks de git instalados.", "Git hooks installed."),
    t(
      `Faltan los hooks de git: ejecuta \`${COMMAND} init\`.`,
      `Git hooks are missing: run \`${COMMAND} init\`.`,
    ),
  );
  const tools = (await detectProject(root, "")).tools;
  if (tools.includes("claude-code")) {
    const settings = `${(await readText(join(root, ".claude/settings.json"))) ?? ""}${(await readText(join(root, ".claude/settings.local.json"))) ?? ""}`;
    check(
      hasGuard(settings, "claude-code"),
      t("Claude Code: guard instalado.", "Claude Code: guard installed."),
      t(
        `Claude Code: falta el guard; ejecuta \`${COMMAND} init\`.`,
        `Claude Code: the guard is missing; run \`${COMMAND} init\`.`,
      ),
    );
  }
  if (tools.includes("cursor")) {
    check(
      hasGuard(await readText(join(root, ".cursor/hooks.json")), "cursor"),
      t("Cursor: guard instalado.", "Cursor: guard installed."),
      t(
        `Cursor: falta el guard; ejecuta \`${COMMAND} init --tools cursor\`.`,
        `Cursor: the guard is missing; run \`${COMMAND} init --tools cursor\`.`,
      ),
    );
  }
  const command = session.environment.invocation;
  const reachable =
    command.script !== undefined
      ? await exists(command.script)
      : (await execute("sh", ["-c", `command -v ${COMMAND}`], { cwd: root })).code === 0;
  check(
    reachable,
    t(
      `Los hooks pueden ejecutar Specty (${command.command}).`,
      `Hooks can run Specty (${command.command}).`,
    ),
    t(
      "Los hooks no encuentran Specty: instálalo con `npm i -g @baquia-dev/specty`.",
      "Hooks cannot find Specty: install it with `npm i -g @baquia-dev/specty`.",
    ),
  );
  check(
    session.config.verify.default !== undefined,
    t(
      `Verificación por defecto: \`${session.config.verify.default ?? ""}\`.`,
      `Default verification: \`${session.config.verify.default ?? ""}\`.`,
    ),
    t(
      "Falta verify.default en .specty/config.yaml.",
      "verify.default is missing in .specty/config.yaml.",
    ),
  );
  return {
    status: problems.length === 0 ? "ok" : "invalid",
    header: headerOf("doctor"),
    blocks: [...section("OK", ok), ...section(t("PROBLEMAS", "PROBLEMS"), problems)],
    next:
      problems.length === 0
        ? t(
            `todo listo; el agente empieza con \`${COMMAND} next\`.`,
            `all set; the agent starts with \`${COMMAND} next\`.`,
          )
        : t(
            "corrige los problemas y vuelve a ejecutar `specty doctor`.",
            "fix the problems and run `specty doctor` again.",
          ),
  };
}
