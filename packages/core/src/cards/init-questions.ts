// SPDX-License-Identifier: Apache-2.0
import { AGENT_NAMES, type AgentTool, isAgentTool } from "../agents";
import { GIT_FLOWS, type GitFlow } from "../branches";
import type { Lang } from "../i18n";
import { translator } from "./text";

// The options `specty init` offers a person: the language, the agents and the git flow, with
// their questions, their answers and the lines that name them when nobody could be asked.

/** Every agent tool, in the order of `AGENT_NAMES`: Claude Code first. */
const AGENT_TOOLS = Object.keys(AGENT_NAMES).filter(isAgentTool);

const AGENT_HINTS: Readonly<Record<AgentTool, readonly [string, string]>> = {
  "claude-code": [
    "CLI de Anthropic: hooks y reglas en .claude/ (ej. guard de comandos, enter)",
    "Anthropic CLI: hooks and rules in .claude/ (e.g. command guard, enter)",
  ],
  cursor: [
    "IDE con IA: reglas y guard en .cursor/rules/ (ej. agentes y permisos en el editor)",
    "AI IDE: rules and guard in .cursor/rules/ (e.g. agents and editor permissions)",
  ],
  codex: [
    "CLI de OpenAI: hooks en .codex/ (ej. tareas con agentes autónomos)",
    "OpenAI CLI: hooks in .codex/ (e.g. autonomous agent tasks)",
  ],
  opencode: [
    "Agente terminal de código abierto: configuración en .opencode/ (ej. ejecución de tareas)",
    "Open-source terminal agent: config in .opencode/ (e.g. task runs)",
  ],
  "gemini-cli": [
    "CLI de Google Gemini: hooks y extensiones en .gemini/ (ej. asistencia de código)",
    "Google Gemini CLI: hooks and extensions in .gemini/ (e.g. coding assistant)",
  ],
  copilot: [
    "GitHub Copilot: instrucciones en .github/copilot-instructions.md (ej. agentes en el IDE)",
    "GitHub Copilot: instructions in .github/copilot-instructions.md (e.g. IDE agents)",
  ],
  windsurf: [
    "Devin Desktop / Windsurf: reglas y hooks en .windsurfrules y .devin/ (ej. Devin IDE)",
    "Devin Desktop / Windsurf: rules and hooks in .windsurfrules and .devin/ (e.g. Devin IDE)",
  ],
  antigravity: [
    "Antigravity de Google DeepMind: reglas en .agents/rules/ (ej. hooks de sesión)",
    "Google DeepMind Antigravity: rules in .agents/rules/ (e.g. session hooks)",
  ],
};

/**
 * `init`'s question to a person, after the language: which agents they work with, several
 * allowed. Whether it `detected` any says if some come already checked.
 */
export function agentQuestion(detected: boolean, lang: Lang): string {
  const t = translator(lang);
  return detected
    ? t(
        "¿Con qué agentes trabajas en este repositorio? Los detectados ya están marcados; puedes marcar varios.",
        "Which agents do you work with in this repository? The detected ones are already checked; you can check several.",
      )
    : t(
        "No se detectó ningún agente. ¿Con cuáles trabajas en este repositorio? Puedes marcar varios.",
        "No agent detected. Which ones do you work with in this repository? You can check several.",
      );
}

/** The answers to `agentQuestion`: every agent tool, Claude Code first; the `detected` say so. */
export function agentChoices(
  detected: readonly AgentTool[],
  lang: Lang,
): readonly { readonly value: AgentTool; readonly label: string; readonly hint?: string }[] {
  const t = translator(lang);
  const mark = t("detectado", "detected");
  return AGENT_TOOLS.map((tool) => {
    const [es, en] = AGENT_HINTS[tool];
    return {
      value: tool,
      label: detected.includes(tool) ? `${AGENT_NAMES[tool]} (${mark})` : AGENT_NAMES[tool],
      hint: t(es, en),
    };
  });
}

/** No agent was detected and nobody could be asked: Claude Code's guard went in. */
export function noAgentWarning(command: string, lang: Lang): string {
  const tools = AGENT_TOOLS.join(", ");
  return translator(lang)(
    `No se detectó ningún agente: se instaló el guard de Claude Code. Si usas otro, ejecuta \`${command} init --tools <herramienta>\` con alguna de estas: ${tools}.`,
    `No agent detected: Claude Code's guard was installed. If you use another, run \`${command} init --tools <tool>\` with any of: ${tools}.`,
  );
}

/** `init`'s first question to a person: in both languages, as neither is known yet. */
export function languageQuestion(): string {
  return "¿En qué idioma trabaja Specty? · Which language should Specty work in?";
}

/** The answers to `languageQuestion`, the detected language first. */
export function languageChoices(
  detected: Lang,
): readonly { readonly value: Lang; readonly label: string; readonly hint?: string }[] {
  const choices = [
    {
      value: "es",
      label: "Español",
      hint: "Comandos, tarjetas y especificaciones en español (ej. specty new, tareas)",
    },
    {
      value: "en",
      label: "English",
      hint: "Commands, specs, and cards in English (e.g. specty new, tasks)",
    },
  ] as const;
  return choices.toSorted((a, b) => Number(b.value === detected) - Number(a.value === detected));
}

/** The changes' branches under each flow, as `branchName` makes them. */
const FLOW_BRANCHES: Readonly<Record<GitFlow, readonly [string, string]>> = {
  specty: ["specty/<id>", "specty/<id>"],
  github: ["<tipo>/<slug>, como feat/<slug>", "<type>/<slug>, such as feat/<slug>"],
  trunk: ["<tipo>/<slug>, como feat/<slug>", "<type>/<slug>, such as feat/<slug>"],
  gitflow: [
    "feature/<slug>, bugfix/<slug>, hotfix/<slug> y release/<slug>",
    "feature/<slug>, bugfix/<slug>, hotfix/<slug> and release/<slug>",
  ],
};

const FLOW_HINTS: Readonly<Record<GitFlow, readonly [string, string]>> = {
  specty: [
    "Ramas aisladas por cambio con fecha e id (ej. specty/20261031-login)",
    "Isolated change branches with date and id (e.g. specty/20261031-login)",
  ],
  github: [
    "Ramas por tipo hacia main mediante PRs (ej. feat/login, fix/auth)",
    "Branches by type merged into main via PRs (e.g. feat/login, fix/auth)",
  ],
  gitflow: [
    "Ramas completas del flujo hacia develop y main (ej. feature/login, bugfix/typo, hotfix/seguridad, release/1.0)",
    "Full flow branches into develop and main (e.g. feature/login, bugfix/typo, hotfix/security, release/1.0)",
  ],
  trunk: [
    "Ramas cortas directas a main (ej. feat/login, fix/auth)",
    "Short-lived branches merged quickly into main (e.g. feat/login, fix/auth)",
  ],
};

/** `init --git-flow` set `git.flow`: how the changes' branches will be named. */
export function flowLine(flow: GitFlow, lang: Lang): string {
  const [es, en] = FLOW_BRANCHES[flow];
  return translator(lang)(
    `.specty/config.yaml: git.flow es ${flow}; las ramas de los cambios serán ${es}.`,
    `.specty/config.yaml: git.flow is ${flow}; the changes' branches will be ${en}.`,
  );
}

const FLOW_TITLES: Readonly<Record<GitFlow, string>> = {
  specty: "Specty",
  github: "GitHub Flow",
  gitflow: "Git Flow",
  trunk: "Trunk",
};

/** `init`'s question to a person, after the agents: which git flow names the changes' branches. */
export function flowQuestion(detected: GitFlow | undefined, lang: Lang): string {
  const t = translator(lang);
  return detected === undefined
    ? t(
        "¿Qué flujo de git sigue este repositorio? Specty nombrará así las ramas de los cambios.",
        "Which git flow does this repository follow? Specty will name the changes' branches by it.",
      )
    : t(
        "¿Qué flujo de git sigue este repositorio? El detectado va primero; Specty nombrará así las ramas de los cambios.",
        "Which git flow does this repository follow? The detected one comes first; Specty will name the changes' branches by it.",
      );
}

/**
 * The answers to `flowQuestion`, each with its branches: the `detected` one first and saying so;
 * then Specty's own, which keeps the names of always, GitHub Flow, Git Flow and trunk.
 */
export function flowChoices(
  detected: GitFlow | undefined,
  lang: Lang,
): readonly { readonly value: GitFlow; readonly label: string; readonly hint?: string }[] {
  const t = translator(lang);
  const order = Object.keys(FLOW_TITLES).filter((flow): flow is GitFlow => flow !== detected);
  return (detected === undefined ? order : [detected, ...order]).map((flow) => {
    const [es, en] = FLOW_BRANCHES[flow];
    const [hintEs, hintEn] = FLOW_HINTS[flow];
    const label = `${FLOW_TITLES[flow]}: ${t(es, en)}`;
    return {
      value: flow,
      label: flow === detected ? `${label} (${t("detectado", "detected")})` : label,
      hint: t(hintEs, hintEn),
    };
  });
}

/** A new project ended `init` with no git flow: its changes' branches keep Specty's names. */
export function noFlowWarning(command: string, lang: Lang): string {
  const flows = GIT_FLOWS.join("|");
  return translator(lang)(
    `Proyecto nuevo sin flujo de git: las ramas de los cambios serán specty/<id> hasta que lo elijas con \`${command} init --git-flow <${flows}>\`.`,
    `New project without a git flow: the changes' branches will be specty/<id> until you choose one with \`${command} init --git-flow <${flows}>\`.`,
  );
}
