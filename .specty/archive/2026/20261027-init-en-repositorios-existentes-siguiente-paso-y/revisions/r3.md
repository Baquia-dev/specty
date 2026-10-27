---
kind: standard
---

# init en repositorios existentes: siguiente paso y agente que instala

## Objetivo

En un repositorio que ya existía, `specty init` falla en dos cosas. Su SIGUIENTE pide completar «Mapa» y «Convenciones» de AGENTS.md aunque un AGENTS.md anterior no tenga esas secciones. Además, solo reconoce un agente por sus archivos, así que un repositorio que solo usa Codex (AGENTS.md y `.agents/skills/`, sin `.codex/`) recibe el guard de Claude Code. Con este cambio, el SIGUIENTE solo nombra las secciones que siguen vacías. `init` instala también el guard del agente que lo ejecuta y, si no encuentra ninguno, le pregunta a la persona cuál usa o avisa de cómo elegirlo.

## Fuera de alcance

- Añadir «Mapa» y «Convenciones» a un AGENTS.md que ya existía: lo que está fuera de los bloques de Specty es de la persona.
- Hacer de `.agents/skills/` una marca de Codex: lo leen varios agentes.
- Elegir varios agentes en la pregunta: para eso sigue `--tools`.
- `doctor` y `uninstall`, que no cambian.

## Supuestos

- A1: `.agents/skills/` no sirve para reconocer a Codex, porque lo comparten varios agentes; el agente que ejecuta `init`, que `detectAgentTool` reconoce por su entorno, sí dice cuál se usa en el repositorio.
  - impacto: alto
- A2: El agente que ejecuta `init` trabaja en ese repositorio, así que su guard se instala junto a los de las herramientas que se detectan por sus archivos, no en su lugar; instalar un guard solo quita permisos, así que una detección equivocada no concede nada.
  - impacto: alto
- A3: Una persona en la terminal prefiere una pregunta a que se instale Claude Code sin avisar; elige un solo agente, como la pregunta del idioma, y Claude Code sigue siendo la primera opción.
  - impacto: medio
- A4: El SIGUIENTE mira AGENTS.md con el mismo criterio que `doctor` (`unfilledSections`): las secciones «Mapa» y «Convenciones», en español o en inglés, que el archivo tiene y siguen vacías, por su título tal como está escrito.

## Criterios de aceptación

- AC1: CUANDO `init` termina y AGENTS.md tiene «Mapa» o «Convenciones» vacías ENTONCES su SIGUIENTE pide completar esas secciones, por su título, revisar `.specty/config.yaml` y ejecutar `specty doctor`.
- AC2: CUANDO AGENTS.md no tiene esas secciones, o ya están completas, ENTONCES el SIGUIENTE de `init` solo pide revisar `.specty/config.yaml` y ejecutar `specty doctor`.
- AC3: CUANDO un agente que se reconoce por su entorno ejecuta `init` sin `--tools` ENTONCES `init` instala su guard además de los de las herramientas detectadas por sus archivos; Codex, en un repositorio con solo AGENTS.md y `.agents/skills/`, instala el de Codex y no el de Claude Code.
- AC4: CUANDO una persona en la terminal ejecuta `init` sin `--tools` ni `--dry-run` y no se detecta ningún agente ENTONCES `init` le pregunta con qué agente trabaja, después del idioma y con Claude Code como primera opción, e instala el elegido.
- AC5: CUANDO no se detecta ningún agente y nadie puede responder (un agente que no se reconoce, o `--dry-run`) ENTONCES `init` instala o planea el guard de Claude Code y avisa de que no detectó ningún agente y de cómo elegir otro con `--tools`.
- AC6: CUANDO se pasa `--tools` ENTONCES `init` instala solo esas herramientas, sin preguntar ni añadir el agente del entorno.
- AC7: CUANDO se lee ARCHITECTURE §14 ENTONCES dice cómo elige `init` los agentes (archivos, agente que lo ejecuta, pregunta o Claude Code con aviso), que `.agents/` no marca ninguno y qué secciones nombra su SIGUIENTE.

## Diseño

- Core, en `cards/init.ts`:
  - `InitView` gana `unfilled`, las secciones vacías de AGENTS.md.
  - `initCard` las nombra en el SIGUIENTE, o solo pide revisar la configuración y `doctor`.
  - `agentQuestion(lang)` y `agentChoices()`: cada herramienta de `AGENT_NAMES`, con Claude Code primero.
  - `noAgentWarning(command, lang)`: el aviso de AC5.
- CLI, en `install/hooks.ts`: `agentsToInstall` decide las herramientas.
  - Con `--tools`, esas.
  - Si no, las detectadas por sus archivos más la de `detectAgentTool(env)`.
  - Si no queda ninguna: con una persona en la terminal y sin `--dry-run`, la pregunta; si no, Claude Code y el aviso.
- CLI, en `commands/init.ts`: usa `agentsToInstall` en lugar del valor por defecto, y pasa a la tarjeta `unfilledSections` del AGENTS.md que escribió.

## Archivos

- modificar packages/core/src/cards/init.ts — SIGUIENTE con las secciones vacías, pregunta del agente y aviso
- modificar packages/core/src/cards/index.ts — exportar la pregunta, las opciones y el aviso
- modificar packages/core/test/cards/init.test.ts — los textos nuevos
- modificar packages/cli/src/install/hooks.ts — `agentsToInstall`
- modificar packages/cli/src/commands/init.ts — usarlo y pasar las secciones vacías
- crear packages/cli/test/init-agents.test.ts — qué agentes instala y qué dice el SIGUIENTE
- modificar docs/ARCHITECTURE.md — §14

## Tareas

- [x] T1: el SIGUIENTE de init nombra solo las secciones vacías de AGENTS.md
  - files: packages/core/src/cards/init.ts, packages/core/test/cards/init.test.ts, packages/cli/src/commands/init.ts, packages/cli/test/init-agents.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-agents.test.ts
- [x] T2: los textos de la pregunta del agente y del aviso sin agente
  - files: packages/core/src/cards/init.ts, packages/core/src/cards/index.ts, packages/core/test/cards/init.test.ts
  - ac: AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/init.test.ts
- [x] T3: init instala el agente que lo ejecuta y pregunta o avisa si no encuentra ninguno
  - files: packages/cli/src/install/hooks.ts, packages/cli/src/commands/init.ts, packages/cli/test/init-agents.test.ts
  - ac: AC3, AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-agents.test.ts
- [x] T4: ARCHITECTURE dice cómo elige init los agentes y qué pide su SIGUIENTE
  - files: docs/ARCHITECTURE.md
  - ac: AC7
  - type: docs

## Riesgos

- R1: Los tests que ejecutan `init` sin `--tools` en un repositorio sin agentes reciben ahora el aviso de AC5. Mitigación: es lo que debe pasar; los que comparan los avisos exactos se ajustan.
- R2: Una variable de entorno de otro agente que quedó en la terminal de la persona añadiría su guard. Mitigación: `detectAgentTool` ya decide con esas marcas quién es una persona, y un guard de más solo quita permisos; `uninstall` o `--tools` lo corrigen.

## Cierre

### Resumen

El SIGUIENTE de `specty init` solo pide completar las secciones «Mapa» y «Convenciones» que AGENTS.md tiene y siguen vacías, por su título y con el criterio de `doctor`. Sin ninguna, como en un AGENTS.md que ya existía, pide revisar `.specty/config.yaml` y ejecutar `specty doctor`. `init` instala el guard del agente que lo ejecuta, reconocido por su entorno, además de los que detecta por sus archivos: Codex, en un repositorio con solo AGENTS.md y `.agents/skills/`, recibe el suyo y no el de Claude Code. Si no encuentra ninguno, le pregunta a la persona en la terminal con qué agente trabaja; si nadie puede responder, instala Claude Code y avisa de cómo elegir otro con `--tools`. ARCHITECTURE §14 lo explica.

### Desviaciones

- T1 cambió una entrada del test de la tarjeta que ya existía: `InitView` gana `unfilled` como campo obligatorio, así que la llamada recibe `unfilled: ["Mapa", "Convenciones"]` y la salida que comprueba es la misma.
- La pregunta del agente va antes de la entrevista de un proyecto nuevo, justo después del idioma, y no al instalar los hooks.

### Decisiones

- `agentsToInstall` vive en `install/hooks.ts`, junto a la instalación de los hooks de cada agente, y no en `commands/init.ts`, que ya pasa de 280 líneas.
- La pregunta ofrece todas las herramientas de `AGENT_NAMES`, también GitHub Copilot, que no tiene guard: elegirlo da el aviso de siempre de las herramientas sin hooks.
- Si la persona no elige nada, se instala Claude Code, como antes.
- Comprobado con el CLI compilado en dos repositorios de prueba: Codex ejecutando `init` instala solo el guard de Codex, y sin agente reconocible ni persona instala el de Claude Code con el aviso.

### Pendientes

- Ninguno.
