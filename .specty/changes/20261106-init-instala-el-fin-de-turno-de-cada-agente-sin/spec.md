---
kind: standard
epic: 20261106-los-agentes-siempre-esperan-la-decision-de-la
slice: C5
---

# `init` instala el fin de turno de cada agente sin `check --install`

## Objetivo

Hoy el fin de turno (`specty hook agent-stop <agente>`), que con C4 devuelve al agente a esperar con `specty wait`, solo existe donde la persona ejecutó `specty check --install`. Con este cambio `init` lo escribe junto al guard de cada agente que tiene fin de turno, con la marca `--no-check`, que se queda en la regla de `wait`. `check --install` le quita la marca para que también ejecute `specty check --changed`, como hasta ahora.

## Fuera de alcance

- Que `doctor` avise si falta el fin de turno en una instalación anterior: es el corte C6.
- Cambiar la regla de `wait` del fin de turno o la tarjeta de `next`: son de los cortes C4 y C1.
- Cambiar el hook de la memoria (`memory-stop`) o dónde lo escribe `init`.
- Quitar el fin de turno que deja en el otro archivo de ajustes de Claude Code un `init` anterior con otro comando de Specty (de local a versionado o al revés). Ya pasaba con el de `check --install`.
- Copilot, que no tiene un fin de turno que haga seguir al agente.

## Supuestos

- A1: El fin de turno que escribe `init` es el de `check --install` con la marca al final: `<specty> hook agent-stop <agente> --no-check`. Lleva el comando del guard, va en el sitio de cada agente (su `stop.plan`) y tiene el tiempo límite de `verify.timeoutSec` de la configuración que había, o el de por defecto si no había una válida. `check --install` le quita la marca sin mover la entrada ni cambiar su tiempo, y donde falta lo escribe sin marca, como hoy.
  - impacto: alto
- A2: Un fin de turno que ya está sin la marca lo puso `check --install`. `init` lo deja como está y sigue con su check (AC7 de la épica). En OpenCode, un plugin anterior a `CHECK` con `STOP` puesto también tenía el check encendido.
  - impacto: alto
- A3: Con `--no-check`, `hook agent-stop` aplica solo la regla de `wait` de C4, con la misma cuenta por turno, el mismo `acts` y nunca con un subagente. Si la regla no actúa, deja terminar el turno como cuando `check --changed` pasa (con `stop.pass` en Antigravity). La marca llega también por la entrada rápida de los hooks (`runHook`), y el comando oculto `hook` del CLI completo la acepta.
  - impacto: medio
- A4: En OpenCode, `init` deja `STOP` puesto con el tiempo límite y escribe `CHECK = false`. Mientras `CHECK` está apagado, el plugin llama a `hook agent-stop opencode --no-check`, y `check --install` pone `CHECK = true`.
  - impacto: medio
- A5: `uninstall` ya quita toda entrada con `hook agent-stop` de los archivos JSON, también la que lleva `--no-check`. También quita el hook `specty` de Antigravity y el plugin de OpenCode enteros, así que no cambia. El hook de la memoria sigue igual: `init` lo escribe en Claude Code y Codex antes del fin de turno.
  - impacto: bajo
- A6: Este corte no añade textos visibles. La salida de `init` y de `check --install` no cambia, y el diff de `check --install` enseña la marca que quita. El AC9 de la épica se cumple sin textos nuevos.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona ejecuta `init` con Claude Code, Codex, Cursor, Gemini CLI, Devin o Antigravity ENTONCES el archivo de hooks de cada uno lleva el fin de turno `hook agent-stop <agente> --no-check` junto a su guard, con su mismo comando de Specty y el tiempo límite de `verify.timeoutSec`, una sola vez aunque `init` se repita.
- AC2: CUANDO el fin de turno lleva `--no-check` ENTONCES devuelve al agente con la regla de `wait` si el cambio espera a la persona y ningún `specty wait` lo espera, y nunca ejecuta `specty check --changed`: si fallaría, el turno termina igual.
- AC3: CUANDO la persona ejecuta `check --install` después de `init` ENTONCES el fin de turno pierde `--no-check` en la misma entrada y con el mismo tiempo límite, y vuelve a ejecutar `check --changed`. Un segundo `check --install` no propone nada del fin de turno.
- AC4: CUANDO la persona ejecuta `init` en una instalación cuyo fin de turno ya ejecuta el check (sin `--no-check`) ENTONCES lo deja como estaba, con su check.
- AC5: CUANDO la persona ejecuta `init` con OpenCode ENTONCES el plugin lleva `STOP` con el tiempo límite y `CHECK` apagado, y su fin de turno llama a `hook agent-stop opencode --no-check`. `check --install` enciende `CHECK`, y un plugin anterior con `STOP` puesto y sin `CHECK` sigue con su check.
- AC6: CUANDO la persona ejecuta `uninstall` ENTONCES quita también el fin de turno que escribió `init` y deja los hooks de la persona. CUANDO `init` escribe el fin de turno ENTONCES el hook de la memoria (`memory-stop`) sigue igual en Claude Code y Codex.

## Diseño

- `agents/adapter.ts`: la marca `NO_CHECK` (`--no-check`) y un `check` en `StopPlan`. `jsonStop` escribe el hook con la marca cuando `check` es falso. Con `check`, si el archivo ya tiene el hook con la marca, se la quita a cada `command` que acaba en ` hook agent-stop <agente> --no-check`; si ya lo tiene sin ella, no lo toca.
- `enforce/entry.ts` pasa a cada fin de turno los argumentos que siguen al agente, y `enforce/commands.ts` deja pasar la marca al comando oculto `hook` (`allowUnknownOption`). `enforce/agent-stop.ts`: con `--no-check`, `turnReport` no ejecuta `checkReport`.
- `install/hooks.ts`: `installAgentStops` planifica el `stop.plan` de cada agente de `tools` con `check: false`. `install/install.ts` la llama después de `installHooks`, con `verify.timeoutSec` de la configuración que había o el de `DEFAULT_CONFIG`. `check/install-agents.ts` pasa `check: true`.
- OpenCode (`install/opencode.ts`, `agents/opencode.ts`): el plugin lleva `CHECK` y llama a `hook agent-stop opencode` con `--no-check` mientras está apagado. `planOpencodeTurn` (la de `init`) pone `STOP` si falta, y `planOpencodeStop` (la de `check --install`) pone `STOP` y `CHECK`. `installOpencode` conserva los dos, y un plugin sin `CHECK` lo tiene encendido si su `STOP` lo está.
- Docs: `docs/formats.md` (el paso del fin de turno de `check --install`) y `docs/ARCHITECTURE.md` («Fin de turno», la fila de OpenCode y lo que quita `uninstall`).

## Archivos

- modificar packages/cli/src/agents/adapter.ts — la marca `--no-check` y el `check` del plan del fin de turno: `init` lo escribe con la marca y `check --install` se la quita
- modificar packages/cli/src/enforce/agent-stop.ts — con `--no-check`, solo la regla de `wait`, sin `check --changed`
- modificar packages/cli/src/enforce/entry.ts — pasa al fin de turno los argumentos que siguen al agente
- modificar packages/cli/src/enforce/commands.ts — el comando oculto `hook` acepta la marca `--no-check`
- modificar packages/cli/src/check/install-agents.ts — `check --install` planifica el fin de turno con su check
- modificar packages/cli/src/install/hooks.ts — `installAgentStops`: el fin de turno de cada agente de `init`, sin el check
- modificar packages/cli/src/install/install.ts — `init` instala el fin de turno tras los guards, con `verify.timeoutSec`
- modificar packages/cli/src/install/opencode.ts — el plugin con `CHECK`: `init` pone `STOP` y `check --install` enciende `CHECK`
- modificar packages/cli/src/agents/opencode.ts — el plan del fin de turno de OpenCode según `check`
- modificar packages/cli/test/agent-stop-wait.test.ts — el fin de turno con `--no-check`, por el CLI y por la entrada rápida de los hooks
- crear packages/cli/test/init-agent-stop.test.ts — `init` escribe el fin de turno con la marca en cada agente, una vez; `check --install` se la quita; `init` conserva el check de una instalación anterior; `uninstall` lo quita
- modificar packages/cli/test/memory-stop-install.test.ts — el `Stop` de Codex cuenta también el fin de turno que escribe `init`
- modificar packages/cli/test/codex.test.ts — el `Stop` de Codex lleva el fin de turno tras la red de la memoria
- modificar packages/cli/test/gemini-cli.test.ts — los hooks que escribe `init` incluyen `AfterAgent`
- modificar packages/cli/test/antigravity.test.ts — el hook `specty` que escribe `init` incluye `Stop`
- modificar packages/cli/test/check-agent-stop.test.ts — OpenCode: `init` pone `STOP` y `CHECK` apagado, `check --install` lo enciende, un plugin anterior conserva su check y el plugin de `init` no ejecuta el check
- modificar docs/formats.md — el paso del fin de turno de `check --install`, tras el que ya escribe `init`
- modificar docs/ARCHITECTURE.md — quién instala el fin de turno, la fila de OpenCode y lo que quita `uninstall`

## Tareas

- [x] T1: El fin de turno con `--no-check` solo aplica la regla de `wait`
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/enforce/agent-stop.ts, packages/cli/src/enforce/entry.ts, packages/cli/src/enforce/commands.ts, packages/cli/test/agent-stop-wait.test.ts
  - ac: AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/agent-stop-wait.test.ts
  - type: feat
- [x] T2: `init` escribe el fin de turno con `--no-check` y `check --install` le quita la marca
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/check/install-agents.ts, packages/cli/src/install/hooks.ts, packages/cli/src/install/install.ts, packages/cli/test/init-agent-stop.test.ts, packages/cli/test/memory-stop-install.test.ts, packages/cli/test/codex.test.ts, packages/cli/test/gemini-cli.test.ts, packages/cli/test/antigravity.test.ts
  - ac: AC1, AC3, AC4, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/init-agent-stop.test.ts test/memory-stop-install.test.ts test/codex.test.ts test/gemini-cli.test.ts test/antigravity.test.ts
  - type: feat
- [x] T3: `init` deja puesto el fin de turno del plugin de OpenCode y `check --install` enciende su check
  - files: packages/cli/src/agents/opencode.ts, packages/cli/src/install/opencode.ts, packages/cli/test/check-agent-stop.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-agent-stop.test.ts test/opencode.test.ts && pnpm typecheck && pnpm lint
  - type: feat
- [x] T4: La documentación cuenta que `init` instala el fin de turno y `check --install` enciende su check
  - files: docs/formats.md, docs/ARCHITECTURE.md
  - ac: AC1, AC3, AC5, AC6
  - verify: pnpm typecheck && pnpm lint && pnpm sources && pnpm knip
  - type: docs

## Riesgos

- R1: Ahora cada fin de turno de cada agente ejecuta un proceso de Specty, también sin `check --install`. Con `--no-check` solo lee el estado del cambio y la marca de `wait`, y fuera de un repositorio de Specty no hace nada.
- R2: Un proyecto que ya usa Specty recibe el fin de turno en su próximo `init`, y Claude Code y Codex lo muestran como un hook nuevo. Su `check --changed` sigue apagado si no lo activó, y `doctor` lo contará en C6.
