---
kind: standard
---

# Specty corre dentro del sandbox de Antigravity CLI

## Objetivo

Antigravity CLI (`agy`) enciende su sandbox de terminal en todo modo print, y dentro Specty no arranca: `node` no puede abrir el bundle, que está fuera del espacio de trabajo, y git no puede escribir en `.git` (P382, P167). La persona decidió ampliar D4 en la instalación (D5). Con este cambio, `specty init --tools antigravity` añade, junto a `command(specty)`, las reglas que dejan correr Specty dentro de ese sandbox: `read_file` del prefijo de node y de la carpeta del bundle, y `write_file` de la carpeta común de git del repositorio, siempre con rutas absolutas. `doctor` y `uninstall` las reconocen como a `command(specty)`. Así Specty funciona para quien usa agy con el sandbox encendido, y un cambio siguiente podrá medir con la suite de cumplimiento la instalación real.

## Fuera de alcance

- Quitar reglas de un node o de un bundle anteriores (por ejemplo, tras cambiar de versión de node con nvm): Specty no puede distinguirlas de las de la persona. `doctor` pide las nuevas.
- Los ajustes de la app de Antigravity y su aviso: sus permisos no están en un archivo legible, y en P168 su sandbox estaba apagado.
- Que `npx -y @baquia-dev/specty` corra dentro del sandbox: necesita la caché de npm y la red.
- Los `permissionOverrides` del guard, las tarjetas que ve el modelo y `BypassSandbox` (P169).
- La suite de cumplimiento (`evals/`): que dé a agy las reglas que escribe la instalación real, y una ejecución real con agy. Van en un cambio siguiente, junto con su resultado en ARCHITECTURE §16 y §18. Ese es el cambio que de verdad resuelve P382.
- `docs/formats.md`: no cambia ningún formato de Specty.

## Supuestos

- A1: Lo comprobado en P167 con `agy` 1.5.1 sigue valiendo con la versión instalada aquí (1.5.3). Las reglas de `permissions.allow` de los ajustes del CLI sí cambian su sandbox. `read_file(<prefijo de node>)` y `read_file(<carpeta de Specty>)` dejan arrancar `specty` dentro, y `write_file(<repo>/.git)` deja escribir a git. Una ruta relativa rompe el sandbox entero, así que todas van absolutas. Lo comprobará con agy real el cambio siguiente, el de la suite.
  - impacto: alto
- A2: El prefijo de node es la carpeta de dos niveles por encima del node que ejecuta `init` (`process.execPath`), el mismo que usará el `specty` del agente, porque los dos salen del PATH de la persona. Con nvm, cambiar de versión cambia el prefijo: `doctor` dice que falta la regla nueva, y `init` la añade.
- A3: La carpeta del bundle es la del script de la CLI. Es `invocation.script` cuando el comando lleva una ruta de la máquina y, si no, la del módulo que corre, como hace `mcp/app.ts`. El bundle está entero en su carpeta `dist/` (chunks, gramáticas y UI), y el E2E de Antigravity abre la misma con `read_file(dirname(DIST))`. Si está dentro del prefijo de node, como en una instalación global de npm, la regla de node ya la cubre y no se escribe.
- A4: `write_file` lleva la carpeta común de git (`gitCommonFolder`, la misma que el guard da en sus `permissionOverrides`). Así sirve también desde la carpeta de un cambio (`.worktrees/<id>`), cuyo git vive en ella, y se escribe igual si `init` corre en una worktree.
- A5: `uninstall` deja todas las reglas en el archivo, como hace con `command(specty)`. D5 dice que las reconoce como a esa regla, y solo permite escribir en la carpeta del usuario al instalar. Entre lo que queda, nombra las reglas de Specty que siguen en el archivo y dice cómo quitarlas. Avisa además de que `write_file` solo sirve a este proyecto.

## Criterios de aceptación

- AC1: CUANDO `specty init --tools antigravity` corre y existe la carpeta del CLI de Antigravity ENTONCES `permissions.allow` de su `settings.json` acaba con estas reglas, tras las de la persona, en este orden y sin repetir ninguna: `command(specty)`, salvo si ya está `unsandboxed(specty)`; `read_file(<prefijo de node>)`; `read_file(<carpeta del bundle>)`, salvo si está dentro del prefijo de node; y `write_file(<carpeta común de git>)`, con rutas absolutas, también desde una worktree. La línea de lo hecho nombra el archivo y las reglas, en español y en inglés.
- AC2: CUANDO `init` corre dos veces, o los ajustes ya tienen algunas de esas reglas ENTONCES solo añade las que faltan, y un archivo que ya las tiene todas queda igual.
- AC3: CUANDO `settings.json` no es un JSON que Specty pueda editar ENTONCES `init` no lo toca, y el aviso nombra el archivo y todas las reglas que añadir a `permissions.allow`, en español y en inglés.
- AC4: CUANDO el proyecto tiene el guard de Antigravity y existe la carpeta de su CLI ENTONCES `specty doctor` da una línea buena si `permissions.allow` tiene todas las reglas (con `command(specty)` o `unsandboxed(specty)`). Si falta alguna, o si el archivo falta o no se analiza, da un problema que nombra las que faltan, pide `specty init --tools antigravity` y sale con 1, en español y en inglés.
- AC5: CUANDO `specty uninstall` corre y los ajustes del CLI tienen reglas de Specty ENTONCES no los toca. Entre lo que queda, nombra las reglas de Specty que siguen en el archivo, dice que `write_file` solo sirve a este proyecto y que las quite de `permissions.allow` si ya no usa Specty, en español y en inglés.

## Diseño

- `packages/cli/src/install/antigravity-cli.ts`:
  - `sandboxRules(git, invocation)` da las reglas de Specty en orden (A2 a A4), con una de comando que vale si es `command(specty)` o `unsandboxed(specty)`.
  - `allowSpecty` añade las que faltan, una a una, con jsonc-parser y por `InstallFiles`, como hoy.
  - `cliRule` pasa a dar, además del archivo, las reglas que faltan y las de Specty que están, para `doctor` y `uninstall`.
- `agents/adapter.ts`: `doctor` recibe además la invocación, y `stays` recibe git y la invocación. `commands/doctor.ts` y `commands/uninstall.ts` se los pasan desde la sesión.
- `agents/antigravity.ts`: `install`, `doctor` y `stays` pasan las reglas a sus textos.
- Core (textos en español y en inglés):
  - en `cards/install.ts`, la línea de lo hecho y el aviso del archivo inválido llevan la lista de reglas, con una función interna que une la lista;
  - en `cards/doctor.ts` y `cards/doctor-agents.ts`, `no-antigravity-cli-rule` lleva `missing`, las que faltan;
  - en `cards/uninstall.ts`, la línea de lo que queda lleva las reglas que están.
- Documentación:
  - ADR 0013 añade a la excepción de Antigravity la ampliación D5, con su fecha, la cita y su alcance;
  - en ARCHITECTURE §10: el punto de Antigravity de «Permisos de la herramienta», la fila de Antigravity de la tabla de herramientas y la frase sobre `uninstall`.

## Archivos

- modificar packages/cli/src/install/antigravity-cli.ts — las reglas del sandbox: cuáles, añadirlas y leer cuáles están
- modificar packages/cli/src/agents/antigravity.ts — `install`, `doctor` y `stays` con las reglas
- modificar packages/cli/src/agents/adapter.ts — la invocación en `doctor`, y git y la invocación en `stays`
- modificar packages/cli/src/commands/doctor.ts — pasa la invocación a cada `doctor`
- modificar packages/cli/src/commands/uninstall.ts — pasa git y la invocación a `stays`
- modificar packages/core/src/cards/install.ts — la línea de lo hecho y el aviso con la lista de reglas
- modificar packages/core/src/cards/doctor.ts — `missing` en `no-antigravity-cli-rule`
- modificar packages/core/src/cards/doctor-agents.ts — los textos de las reglas en `doctor`
- modificar packages/core/src/cards/uninstall.ts — la línea de las reglas que quedan
- modificar packages/core/test/cards/antigravity-cli-rule.test.ts — los textos con las reglas
- modificar packages/cli/test/antigravity-cli-rule.test.ts — `init`, `doctor` y `uninstall` con las reglas del sandbox
- modificar docs/decisions/0013-specty-no-escribe-en-la-carpeta-del-usuario.md — la ampliación D5
- modificar docs/ARCHITECTURE.md — permisos de Antigravity en §10

## Tareas

- [x] T1: Los textos de las reglas del sandbox de Antigravity, en español y en inglés
  - files: packages/core/test/cards/antigravity-cli-rule.test.ts, packages/core/src/cards/install.ts, packages/core/src/cards/doctor.ts, packages/core/src/cards/doctor-agents.ts, packages/core/src/cards/uninstall.ts
  - ac: AC1, AC3, AC4, AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/antigravity-cli-rule.test.ts && pnpm lint
  - type: feat
- [ ] T2: `init --tools antigravity` añade las reglas del sandbox a los ajustes del CLI
  - files: packages/cli/test/antigravity-cli-rule.test.ts, packages/cli/src/install/antigravity-cli.ts, packages/cli/src/agents/antigravity.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity-cli-rule.test.ts -t "AC1|AC2|AC3" && pnpm lint
  - type: feat
- [ ] T3: `doctor` comprueba las reglas y nombra las que faltan
  - files: packages/cli/test/antigravity-cli-rule.test.ts, packages/cli/src/install/antigravity-cli.ts, packages/cli/src/agents/antigravity.ts, packages/cli/src/agents/adapter.ts, packages/cli/src/commands/doctor.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity-cli-rule.test.ts -t "AC4" && pnpm --filter @baquia-dev/specty exec vitest run test/antigravity.test.ts test/doctor-enter.test.ts && pnpm lint
  - type: feat
- [ ] T4: `uninstall` dice qué reglas de Specty quedan en los ajustes del CLI
  - files: packages/cli/test/antigravity-cli-rule.test.ts, packages/cli/src/install/antigravity-cli.ts, packages/cli/src/agents/antigravity.ts, packages/cli/src/agents/adapter.ts, packages/cli/src/commands/uninstall.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity-cli-rule.test.ts test/uninstall.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [ ] T5: La documentación: ADR 0013 y los permisos de Antigravity en ARCHITECTURE
  - files: docs/decisions/0013-specty-no-escribe-en-la-carpeta-del-usuario.md, docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Otra versión de agy cambia cómo lee las reglas, o el sandbox necesita leer algo más (otra carpeta de node, la caché de algún gestor). Mitigación: el cambio siguiente lo comprueba con agy real en la suite, y lo que falte queda como pendiente con lo que dijo el sandbox.
- R2: La regla de node abre en el sandbox, para leer, una carpeta amplia si node está en una ruta del sistema (`/usr/local`, `/opt/homebrew`). Mitigación: es solo lectura, sin escritura, y la persona ve cada regla en la línea de `init`.
- R3: Un test que no pase por `testEnv()` escribiría en la carpeta real de la persona. Mitigación: los tests nuevos usan su propia carpeta temporal, como los de D4.
