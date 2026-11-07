---
kind: standard
epic: 20261107-flujo-configurable-en-la-ui
slice: C16
---

# El tiempo del hook de Antigravity pasa a ser un ajuste interno

## Objetivo

Hoy `specty init` escribe en `.agents/hooks.json` los hooks del guard de Antigravity con un tiempo de 30 s, fijo en el código (`hookOf` de `agents/antigravity.ts`): si el guard tarda más, Antigravity bloquea la herramienta. Con este cambio es la clave opcional `internal.hooks.antigravityTimeoutSec`, con un mínimo y un máximo en el schema y 30 por defecto. `init` la escribe y, al volver a ejecutarse, la reescribe; `doctor` avisa cuando el tiempo de los hooks no es el de la configuración. La página «Configuración» la muestra en «Interno» con la marca «Nuevo». Es el corte C16 de la épica: cubre AC23, AC25 y AC26 para este parámetro.

## Fuera de alcance

- Reescribir `.agents/hooks.json` fuera de `init`: ni `doctor`, ni el guard, ni `specty ui` al guardar la clave lo tocan (decisión D2, «Specty detecta, el agente corrige»). `doctor` solo dice que hay que volver a ejecutar `specty init --tools antigravity`.
- El tiempo del fin de turno de Antigravity (`Stop`), que sigue siendo `verify.timeoutSec`, y los tiempos de los hooks de las demás herramientas, que Specty no escribe.
- Las copias de `.agents/hooks.json` que `specty new` ya puso en las carpetas de los cambios en curso: se quedan con el tiempo que tenían hasta el siguiente `new`.
- Los límites del servidor de la UI (C13), los de lo que muestran las tarjetas (C14) y los de los comandos y los checks (C15).
- Plegar la sección «Interno» y su aviso, que ya pone C8, y tocar la UI: la página ya muestra cada ajuste del catálogo.

## Supuestos

- A1: La clave es `internal.hooks.antigravityTimeoutSec`: 30 por defecto, un entero entre 10 y 300. Va en un bloque `hooks` nuevo de `schema/internal-run.ts`, junto a `exec` y `server` de C9 y C12, porque es cuánto deja Antigravity correr un comando de Specty. Así `config.ts` no cambia y no hay un segundo bloque `internal`. El mínimo, 10 s, deja arrancar Node y responder al guard en una máquina cargada; por debajo, un hook cortado bloquearía cada herramienta (R2 de la épica). El máximo, 300 s, acota lo que Antigravity se queda parado si el guard se cuelga.
  - impacto: medio
- A2: Las instalaciones ya hechas se quedan como están hasta que la persona o el agente vuelven a ejecutar `specty init --tools antigravity`, que reescribe el hook `specty` entero con el tiempo de la configuración y conserva su `Stop` y los hooks de la persona, como hoy. `doctor` lo detecta: con el guard completo, si algún hook del guard (`PreToolUse`, `PostToolUse` o `PreInvocation`) tiene otro tiempo o no tiene, da un problema que nombra el archivo, la clave y su valor, y pide ese `init`, como los avisos de un hook de un `init` anterior (`antigravity-acp`, `antigravity-cli`).
  - impacto: alto
- A3: `init` usa la configuración que ya había si era válida, y si no los valores por defecto, como hace con `verify.timeoutSec` para el fin de turno. `doctor` usa la configuración de su sesión.
  - impacto: bajo
- A4: El contexto de la instalación de cada agente (`InstallContext` de `agents/adapter.ts`) y `doctor` de cada agente reciben la configuración resuelta. Los demás agentes la ignoran; `installHooks` la toma opcional, con `DEFAULT_CONFIG` por defecto, para que los tests que la llaman sin ella sigan igual.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO `.specty/config.yaml` tiene `internal.hooks.antigravityTimeoutSec` y se ejecuta `specty init --tools antigravity` ENTONCES los hooks del guard del hook `specty` de `.agents/hooks.json` (`PreToolUse`, `PostToolUse` y `PreInvocation`) llevan ese tiempo, y su `Stop` sigue con el de `verify.timeoutSec`. Sin la clave llevan 30, como hoy.
- AC2: CUANDO la clave cambia después de un `init` y se vuelve a ejecutar `specty init --tools antigravity` ENTONCES los hooks del guard pasan al tiempo nuevo, y el `Stop` y los hooks de la persona en ese archivo quedan igual.
- AC3: CUANDO algún hook del guard en `.agents/hooks.json` tiene un tiempo distinto del de la configuración ENTONCES `specty doctor` da un problema que nombra el archivo, la clave y su valor, y pide `specty init --tools antigravity`, en español y en inglés. Con el mismo tiempo no lo da, y tras ese `init` desaparece.
- AC4: CUANDO `internal.hooks.antigravityTimeoutSec` no es un entero entre 10 y 300, o `internal.hooks` tiene otra clave ENTONCES el validador del core da un error con su clave, y Specty no usa el archivo, como con cualquier error de `config.yaml`. Sin la clave, la configuración resuelta tiene 30.
- AC5: CUANDO la persona abre «Configuración» ENTONCES ve el tiempo del hook de Antigravity en la sección «Interno», la última, con la marca «Nuevo», su clave y su valor en segundos.
- AC6: CUANDO la UI está en español o en inglés ENTONCES el nombre y la descripción del ajuste salen en ese idioma.
- AC7: CUANDO se lee `docs/formats.md` §6 ENTONCES documenta `internal.hooks.antigravityTimeoutSec`, con su valor por defecto, sus límites, que rige al ejecutar `init` y que `doctor` avisa si los hooks tienen otro. `docs/ARCHITECTURE.md` lo dice en la fila de Antigravity de la tabla de hooks.
  - test: manual

## Diseño

- Core, `schema/internal-run.ts`: `InternalRunConfig.hooks.antigravityTimeoutSec`, `DEFAULT_INTERNAL_RUN.hooks` con 30, `INTERNAL_RUN_SHAPE.hooks` con `z.strictObject({ antigravityTimeoutSec: z.number().int().min(10).max(300).optional() }).optional()` y `resolveInternalRun` con su valor. `config.ts` ya reúne este módulo bajo `internal` y no cambia.
- Core, `settings/catalog.ts`: en el bloque `INTERNAL_RUN`, tras los puertos, `{ key: "internal.hooks.antigravityTimeoutSec", section: "internal", kind: "number", unit: "s", new: true }`. `cards/settings-internal.ts`: su nombre y su descripción en `INTERNAL_RUN_TEXTS`, en los dos idiomas.
- Core, `cards/doctor.ts` y `cards/doctor-agents.ts`: la línea `antigravity-timeout`, con `file` y `seconds`, y su texto en los dos idiomas, junto a `antigravity-acp` y `antigravity-cli`.
- CLI, `agents/adapter.ts`: `InstallContext.config` y un cuarto parámetro `config` en `doctor`, ambos `ResolvedConfig`. `install/hooks.ts`: `installHooks` toma `config` opcional (por defecto `DEFAULT_CONFIG`) y lo pasa a cada `install`. `install/install.ts` le pasa `setup.config ?? DEFAULT_CONFIG`. `commands/doctor.ts` pasa `session.config` al `doctor` de cada agente.
- CLI, `agents/antigravity.ts`: `hookOf(command, timeout)` escribe ese tiempo en cada handler; `install` lo toma de `config.internal.hooks.antigravityTimeoutSec`. `hooksDoctor(root, timeout)`, con el guard completo, suma a los problemas `outdatedTimeout`, que da `antigravity-timeout` si algún handler del guard (los de `--event`) tiene otro `timeout`.
- Tests: `core/test/settings/catalog.test.ts` suma la clave a sus listas exactas de «Nuevo» y de «Interno» (y pasa de 13 a 14 ajustes de «Interno»); `core/test/settings/internal-hooks.test.ts`, nuevo, prueba el schema, el ajuste y sus textos (AC4, AC5, AC6), para no alargar `catalog.test.ts`; `core/test/cards/doctor-antigravity-timeout.test.ts`, nuevo, la línea en los dos idiomas (AC3); y `cli/test/antigravity-timeout.test.ts`, nuevo, `init` y `doctor` de verdad (AC1, AC2, AC3). `packages/ui/src/settings/settings-page.test.ts` calcula sus listas de «Nuevo» desde el catálogo, así que no cambia.

## Archivos

- modificar packages/core/src/schema/internal-run.ts — la clave `internal.hooks.antigravityTimeoutSec`, con sus límites y el valor de hoy
- modificar packages/core/src/settings/catalog.ts — el ajuste nuevo en la sección «Interno», con la marca «Nuevo»
- modificar packages/core/src/cards/settings-internal.ts — su nombre y su descripción en español y en inglés
- modificar packages/core/test/settings/catalog.test.ts — la clave en las listas exactas de «Nuevo» y de «Interno»
- crear packages/core/test/settings/internal-hooks.test.ts — los límites del schema, el valor por defecto, el ajuste en «Interno» y sus textos
- modificar packages/core/src/cards/doctor.ts — la línea `antigravity-timeout` de `doctor`
- modificar packages/core/src/cards/doctor-agents.ts — su texto en español y en inglés
- crear packages/core/test/cards/doctor-antigravity-timeout.test.ts — la línea en los dos idiomas
- modificar packages/cli/src/agents/adapter.ts — la configuración en la instalación y en `doctor` de cada agente
- modificar packages/cli/src/agents/antigravity.ts — el tiempo de los hooks del guard, de la configuración, y el problema de `doctor` cuando difiere
- modificar packages/cli/src/install/hooks.ts — `installHooks` pasa la configuración a cada agente
- modificar packages/cli/src/install/install.ts — `init` le da la configuración que había, o la de por defecto
- modificar packages/cli/src/commands/doctor.ts — pasa la configuración al `doctor` de cada agente
- crear packages/cli/test/antigravity-timeout.test.ts — `init` escribe y reescribe el tiempo configurado, y `doctor` avisa cuando difiere
- modificar docs/formats.md — §6: `internal.hooks.antigravityTimeoutSec`
- modificar docs/ARCHITECTURE.md — el tiempo de los hooks de Antigravity y su aviso en `doctor`

## Tareas

- [x] T1: La clave `internal.hooks.antigravityTimeoutSec` en el schema y su ajuste en el catálogo, con sus textos
  - files: packages/core/src/schema/internal-run.ts, packages/core/src/settings/catalog.ts, packages/core/src/cards/settings-internal.ts, packages/core/test/settings/catalog.test.ts, packages/core/test/settings/internal-hooks.test.ts
  - ac: AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/settings/internal-hooks.test.ts test/settings/catalog.test.ts
- [x] T2: La línea de `doctor` para un tiempo de los hooks de Antigravity distinto del configurado, y la clave en formats.md
  - files: packages/core/src/cards/doctor.ts, packages/core/src/cards/doctor-agents.ts, packages/core/test/cards/doctor-antigravity-timeout.test.ts, docs/formats.md
  - ac: AC3, AC7
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/doctor-antigravity-timeout.test.ts
- [ ] T3: `init` escribe en los hooks del guard de Antigravity el tiempo de la configuración
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/agents/antigravity.ts, packages/cli/src/install/hooks.ts, packages/cli/src/install/install.ts, packages/cli/test/antigravity-timeout.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity-timeout.test.ts -t "the time init writes"
- [ ] T4: `doctor` avisa cuando los hooks de Antigravity tienen otro tiempo
  - files: packages/cli/src/agents/adapter.ts, packages/cli/src/agents/antigravity.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/antigravity-timeout.test.ts, docs/ARCHITECTURE.md
  - ac: AC3, AC7
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/antigravity-timeout.test.ts && pnpm typecheck

## Riesgos

- R1: Un tiempo bajo corta el guard en una máquina cargada, y Antigravity bloquea la herramienta. Mitigación: el schema no baja de 10 s, la sección «Interno» va plegada con su aviso (C8) y quitar la clave la devuelve a 30 al volver a ejecutar `init`.
- R2: Cambiar la clave no cambia los hooks ya escritos, y la persona puede creer que ya rige. Mitigación: `doctor` lo dice y pide `init` (A2), y la descripción del ajuste dice que rige al ejecutar `init`.
- R3: C13, C17 y C18 trabajan en paralelo y también tocan `catalog.ts`, `cards/settings-internal.ts`, `catalog.test.ts`, `formats.md` y quizá `internal-run.ts`. Mitigación: cada corte añade sus entradas a su bloque, y el conflicto al incorporar main se resuelve con `specty integrate`, conservando lo de todos.
