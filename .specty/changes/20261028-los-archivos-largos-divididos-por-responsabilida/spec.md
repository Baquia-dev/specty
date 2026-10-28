---
kind: standard
---

# Los archivos largos, divididos por responsabilidad

## Objetivo

`specty check --all` avisa de cuatro archivos por encima de las 300 líneas de código: `cli/src/commands/init.ts` (332), `core/src/cards/index.ts` (332), `core/src/cards/doctor.ts` (320) y `core/src/schema/config.ts` (310). Tres mezclan dos responsabilidades que se separan bien, y este cambio los divide por ellas sin cambiar lo que hacen. El cuarto, `cards/index.ts`, es la lista de exportaciones de los textos, una sola responsabilidad: no se parte solo para cumplir el número.

## Fuera de alcance

- `core/src/cards/index.ts`: es una de las dos listas explícitas de la API de core (AGENTS.md). Partirla daría dos listas sin criterio; si estorba, la persona puede añadirla a `lines.exclude`.
- Cambiar lo que hacen `init`, `doctor` o la configuración: los tests que ya existen son el contrato y no cambian.

## Supuestos

- A1: Basta con mover código a archivos nuevos dentro del mismo paquete, sin reglas ni textos nuevos; los tests que ya existen cubren lo movido, porque importan desde la API pública de cada paquete o ejecutan el CLI.

## Criterios de aceptación

- AC1: CUANDO se ejecuta `specty check --all` con el CLI construido sobre este cambio ENTONCES `max-lines` ya no avisa de `commands/init.ts`, `cards/doctor.ts` ni `schema/config.ts`, ni de los archivos nuevos.
  - test: manual
- AC2: CUANDO se ejecuta `pnpm check` ENTONCES pasa sin cambiar ningún test que ya existía.
  - test: manual

## Diseño

- `init.ts` queda con el comando: leer las opciones, el idioma, la migración del legacy, el commit y el informe. Lo que instala y en qué orden (`install`, `installTarget`, `writeProjectFiles` y los tipos `InitOptions`, `InitSetup` e `Installed`) pasa a `install/install.ts`, en la carpeta de lo que escribe `init`.
- `cards/doctor.ts` queda con las líneas del proyecto (configuración, AGENTS.md, hooks de git, formateadores, verificación, Node, rutas citadas, glosario, modo delegado, gentle-ai) y la tarjeta. Las de cada agente (Claude Code, Cursor, Codex, OpenCode, Antigravity, Devin, Gemini CLI, `enter-outdated` y MCP), con sus textos, pasan a `cards/doctor-agents.ts`. `DoctorLine` sigue siendo la unión de las dos, y su tabla de textos sigue cubriendo cada código por el tipo.
- `schema/config.ts` deja la sección `git` en `schema/git.ts`, como ya está `checks` en `schema/checks.ts`: su tipo, su valor por defecto, su esquema y su resolución.

## Archivos

- modificar packages/cli/src/commands/init.ts — se queda con el comando
- crear packages/cli/src/install/install.ts — lo que instala init y en qué orden
- modificar packages/core/src/cards/doctor.ts — las líneas del proyecto y la tarjeta
- crear packages/core/src/cards/doctor-agents.ts — las líneas de cada agente
- modificar packages/core/src/schema/config.ts — sin la sección git
- crear packages/core/src/schema/git.ts — la sección git de la configuración
- modificar packages/cli/test/init-reversible.test.ts — contrato de T1: debe pasar sin cambios
- modificar packages/core/test/cards/doctor.test.ts — contrato de T2: debe pasar sin cambios
- modificar packages/core/test/schema/schema.test.ts — contrato de T3: debe pasar sin cambios

## Tareas

- [x] T1: Lo que instala init, en su propio archivo
  - files: packages/cli/src/commands/init.ts, packages/cli/src/install/install.ts, packages/cli/test/init-reversible.test.ts
  - ac: AC1, AC2
  - verify: pnpm typecheck && pnpm lint && pnpm knip && pnpm --filter @baquia-dev/specty build && pnpm --filter @baquia-dev/specty exec vitest run test/init-agents.test.ts test/init-commit.test.ts test/init-git-flow.test.ts test/init-language.test.ts test/init-reversible.test.ts
  - type: refactor
- [ ] T2: Las líneas de doctor de cada agente, en su propio archivo
  - files: packages/core/src/cards/doctor.ts, packages/core/src/cards/doctor-agents.ts, packages/core/test/cards/doctor.test.ts
  - ac: AC1, AC2
  - verify: pnpm typecheck && pnpm lint && pnpm knip && pnpm sources && pnpm --filter @baquia-dev/specty-core exec vitest run test/cards
  - type: refactor
- [ ] T3: La sección git de la configuración, en su propio archivo
  - files: packages/core/src/schema/config.ts, packages/core/src/schema/git.ts, packages/core/test/schema/schema.test.ts
  - ac: AC1, AC2
  - verify: pnpm typecheck && pnpm lint && pnpm knip && pnpm --filter @baquia-dev/specty-core exec vitest run test/schema
  - type: refactor

## Riesgos

- R1: Un import circular entre `doctor.ts` y `doctor-agents.ts`, o entre `config.ts` y `git.ts`. Mitigación: los archivos nuevos no importan de los que se dividen; los tipos comunes van en el nuevo o en `cards/text.ts`.
