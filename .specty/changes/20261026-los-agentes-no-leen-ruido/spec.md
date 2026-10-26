---
kind: standard
follows:
  - 20261026-el-fin-de-turno-del-agente-ejecuta-specty-check
---

# Los agentes no leen ruido

## Objetivo

`specty check --install` también configura a cada agente que el repositorio usa para que no lea código generado, dependencias ni artefactos de build, con lo que ya dicen `checks.exclude` y `scope.generated`. Lo hace con el diff de cada archivo y confirmación, añadiendo solo lo que falta. De paso, todos los pasos de la instalación planifican sobre los mismos archivos: dos pasos que tocan el mismo archivo dan un solo diff, y ninguno pisa al otro.

## Fuera de alcance

- GitHub Copilot: su exclusión de contenido se configura en GitHub, no en un archivo del repositorio.
- Codex, OpenCode y Antigravity: su documentación no confirma un archivo de exclusión propio.
- Quitar entradas que la persona puso a mano en esos archivos: solo se añaden las que faltan.

## Supuestos

- A1: Según su documentación vigente y con la sintaxis de `.gitignore`, Cursor no deja leer al agente lo que lista `.cursorignore` en la raíz; Claude Code lo bloquea con `permissions.deny` y reglas `Read(<patrón>)`, que también impiden editar esa ruta; Gemini CLI excluye lo de `.geminiignore` en la raíz; y Windsurf (ahora Devin) excluye lo de `.devinignore` y sigue respetando `.windsurfignore` y `.codeiumignore`.
  - impacto: alto
- A2: Un agente se usa en el repositorio cuando está alguna de sus marcas de `AGENT_CAPABILITIES` (`.cursor`, `.claude` o `CLAUDE.md`, `.gemini` o `GEMINI.md`, `.windsurf` o `.windsurfrules`). Para Windsurf se completa el archivo de exclusión que ya exista; sin ninguno, se crea `.codeiumignore`, que entienden las versiones antiguas y las nuevas.
  - impacto: alto
- A3: Los patrones son los globs de `checks.exclude` y de `scope.generated` tal cual (`**/node_modules/**`, `**/*.g.dart`), que la sintaxis de `.gitignore` entiende; las reglas de Claude Code van en `.claude/settings.json`, el archivo que comparte el equipo.
- A4: Las ediciones de un plan salen de un único `InstallFiles` en seco: cada paso lee lo que dejaron los anteriores, y cada archivo da una sola edición, con su texto en el disco como antes y el planificado como después.

## Criterios de aceptación

- AC1: CUANDO el repositorio usa Cursor, Claude Code, Gemini CLI o Windsurf ENTONCES `specty check --install --dry-run` muestra el diff de su archivo de exclusión con los patrones de `checks.exclude` y `scope.generated` que le faltan (en Claude Code, como `Read(<patrón>)` en `permissions.deny`).
- AC2: CUANDO el archivo ya tiene algunos de esos patrones o otras líneas de la persona ENTONCES solo añade los que faltan y conserva lo demás; una segunda ejecución no tiene nada que añadir.
- AC3: CUANDO un agente no se usa en el repositorio ENTONCES no se crea su archivo.
- AC4: CUANDO dos pasos tocan el mismo archivo (el hook de fin de turno y las reglas `Read` de Claude Code) ENTONCES el plan da una sola edición con los dos cambios, y aplicarla deja los dos.
- AC5: CUANDO el idioma es inglés ENTONCES el comentario que acompaña a los patrones está en inglés.

## Diseño

- `cli/src/check/install-plan.ts`: `planInstall` con sus pasos (el pre-commit, la CI, el modo estricto de Dart, los hooks de fin de turno, la exclusión de ruido) sobre un `InstallFiles` en seco, más las devDependencies y los avisos; las ediciones salen de sus cambios.
- `cli/src/check/install.ts`: solo enseñar, preguntar y aplicar el plan, y hacer el commit.
- `cli/src/check/install-agents.ts`: escribe el hook de fin de turno en ese `InstallFiles`.
- `cli/src/check/install-ignores.ts`: el paso de la exclusión de ruido de cada agente.

## Archivos

- crear packages/cli/src/check/install-plan.ts — el plan de la instalación sobre unos archivos en seco
- modificar packages/cli/src/check/install.ts — solo enseñar, preguntar y aplicar
- modificar packages/cli/src/check/install-agents.ts — escribir el hook en los archivos del plan
- crear packages/cli/src/check/install-ignores.ts — la exclusión de ruido de cada agente
- modificar packages/cli/src/commands/check.ts — tomar `planInstall` de su archivo nuevo
- crear packages/cli/test/check-ignores.test.ts — la exclusión de ruido y las ediciones juntas de un archivo
- modificar docs/formats.md — la exclusión de ruido en `specty check --install`
- modificar docs/ARCHITECTURE.md — los archivos de exclusión de cada agente

## Tareas

- [x] T1: El plan sobre unos archivos en seco, dividido de la aplicación
  - files: packages/cli/src/check/install-plan.ts, packages/cli/src/check/install.ts, packages/cli/src/check/install-agents.ts, packages/cli/src/commands/check.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-install.test.ts test/check-agent-stop.test.ts
- [x] T2: La exclusión de ruido de cada agente
  - files: packages/cli/src/check/install-ignores.ts, packages/cli/src/check/install-plan.ts, packages/cli/test/check-ignores.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-ignores.test.ts test/check-install.test.ts test/check-agent-stop.test.ts
- [x] T3: La documentación
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1
  - verify: pnpm check

## Riesgos

- R1: Un patrón que el agente sí necesita leer (los tipos de una dependencia en `node_modules`) — la persona ve cada diff y puede rechazarlo; los patrones salen de su propia configuración de `checks.exclude`.
