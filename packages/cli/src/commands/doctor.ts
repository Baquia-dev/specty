// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { hasBlock, headerOf, type Output, section, translator } from "@baquia-dev/specty-core";
import { formatterExclusions } from "../detect/formatters";
import { detectProject } from "../detect/project";
import {
  CLAUDE_WORKTREE_EVENTS,
  codexHooksFile,
  hasGuard,
  missingClaudeEvents,
  missingCursorEvents,
} from "../install/agents";
import { gitHooksInstalled } from "../install/git-hooks";
import { opencodePluginFile } from "../install/opencode";
import { execute } from "../io/exec";
import { exists, readText } from "../io/files";
import { COMMAND, type Session } from "../session";
import { readDelegation } from "../store/local";

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
    const missing = missingClaudeEvents([
      await readText(join(root, ".claude/settings.json")),
      await readText(join(root, ".claude/settings.local.json")),
    ]);
    const lacking = (events: readonly string[]) =>
      missing.filter((event) => events.includes(event)).join(", ");
    const afterBash = lacking(["PostToolUse", "PostToolUseFailure"]);
    const worktrees = lacking(CLAUDE_WORKTREE_EVENTS);
    const compact = lacking(["SessionStart"]);
    if (missing.length === 0)
      ok.push(t("Claude Code: guard instalado.", "Claude Code: guard installed."));
    else if (missing.includes("PreToolUse")) {
      problems.push(
        t(
          `Claude Code: falta el guard; ejecuta \`${COMMAND} init\`.`,
          `Claude Code: the guard is missing; run \`${COMMAND} init\`.`,
        ),
      );
    } else {
      if (afterBash !== "") {
        problems.push(
          t(
            `Claude Code: falta la comprobación tras cada comando de Bash (${afterBash}); ejecuta \`${COMMAND} init\`.`,
            `Claude Code: the check after each Bash command is missing (${afterBash}); run \`${COMMAND} init\`.`,
          ),
        );
      }
      if (worktrees !== "") {
        problems.push(
          t(
            `Claude Code: faltan los hooks de las worktrees (${worktrees}), así que \`EnterWorktree\` por nombre no entra en la carpeta del cambio; ejecuta \`${COMMAND} init\`.`,
            `Claude Code: the worktree hooks are missing (${worktrees}), so \`EnterWorktree\` by name does not enter the change's folder; run \`${COMMAND} init\`.`,
          ),
        );
      }
      if (compact !== "") {
        problems.push(
          t(
            `Claude Code: falta la tarjeta de Specty tras compactar (${compact}); ejecuta \`${COMMAND} init\`.`,
            `Claude Code: Specty's card after a compaction is missing (${compact}); run \`${COMMAND} init\`.`,
          ),
        );
      }
    }
  }
  if (tools.includes("cursor")) {
    const missing = missingCursorEvents(await readText(join(root, ".cursor/hooks.json")));
    const before = missing.includes("preToolUse") || missing.includes("beforeShellExecution");
    check(
      missing.length === 0,
      t("Cursor: guard instalado.", "Cursor: guard installed."),
      before
        ? t(
            `Cursor: falta el guard; ejecuta \`${COMMAND} init --tools cursor\`.`,
            `Cursor: the guard is missing; run \`${COMMAND} init --tools cursor\`.`,
          )
        : t(
            `Cursor: falta la comprobación tras cada comando (${missing.join(", ")}); ejecuta \`${COMMAND} init --tools cursor\`.`,
            `Cursor: the check after each command is missing (${missing.join(", ")}); run \`${COMMAND} init --tools cursor\`.`,
          ),
    );
  }
  // Codex's guard lives in the user's configuration, shared by every repository.
  const codex = codexHooksFile(session.environment.env);
  const codexGuard = hasGuard(await readText(codex), "codex");
  if (tools.includes("codex") || codexGuard) {
    check(
      codexGuard,
      t(
        `Codex: guard en ${codex}; Codex lo ejecuta cuando confías en él con \`/hooks\`.`,
        `Codex: guard in ${codex}; Codex runs it once you trust it with \`/hooks\`.`,
      ),
      t(
        `Codex: falta el guard en ${codex}; ejecuta \`${COMMAND} init --tools codex\`.`,
        `Codex: the guard is missing in ${codex}; run \`${COMMAND} init --tools codex\`.`,
      ),
    );
  }
  // So does OpenCode's plugin, in its global configuration.
  const plugin = opencodePluginFile(session.environment.env);
  const pluginText = await readText(plugin);
  const pluginGuard = hasGuard(pluginText, "opencode");
  if (tools.includes("opencode") || pluginGuard) {
    // A plugin from before the check after each command never sends `PostToolUse`.
    const afterShell = pluginText?.includes('"PostToolUse"') === true;
    check(
      pluginGuard && afterShell,
      t(`OpenCode: plugin del guard en ${plugin}.`, `OpenCode: guard plugin in ${plugin}.`),
      pluginGuard
        ? t(
            `OpenCode: al plugin del guard le falta la comprobación tras cada comando; ejecuta \`${COMMAND} init --tools opencode\`.`,
            `OpenCode: the guard plugin lacks the check after each command; run \`${COMMAND} init --tools opencode\`.`,
          )
        : t(
            `OpenCode: falta el plugin del guard en ${plugin}; ejecuta \`${COMMAND} init --tools opencode\`.`,
            `OpenCode: the guard plugin is missing in ${plugin}; run \`${COMMAND} init --tools opencode\`.`,
          ),
    );
  }
  for (const { name, path, add, file, excluded } of await formatterExclusions(root)) {
    check(
      excluded,
      t(`${name} excluye ${path}.`, `${name} excludes ${path}.`),
      t(
        `${name} también revisa ${path}, que escribe Specty: añade ${add} en ${file}.`,
        `${name} also checks ${path}, which Specty writes: add ${add} to ${file}.`,
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
  // Delegated mode is the person's choice, not a fault: a warning that never turns doctor red.
  const delegation = await readDelegation(git);
  const warnings =
    delegation === undefined
      ? []
      : [
          t(
            `Modo delegado activo desde el ${delegation.at.slice(0, 10)} (${delegation.by}): tu agente toma tus decisiones. Para desactivarlo: \`${COMMAND} delegate off\`.`,
            `Delegated mode on since ${delegation.at.slice(0, 10)} (${delegation.by}): your agent makes your decisions. To turn it off: \`${COMMAND} delegate off\`.`,
          ),
        ];
  return {
    status: problems.length === 0 ? "ok" : "invalid",
    header: headerOf("doctor"),
    blocks: [
      ...section("OK", ok),
      ...section(t("AVISOS", "WARNINGS"), warnings),
      ...section(t("PROBLEMAS", "PROBLEMS"), problems),
    ],
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
