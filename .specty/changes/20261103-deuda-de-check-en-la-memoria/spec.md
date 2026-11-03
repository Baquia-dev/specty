---
kind: standard
follows:
  - 20261103-los-riesgos-aceptados-quedan-en-la-memoria-como
---

# La deuda de specty check --all queda en la memoria

## Objetivo

Segundo corte de P31 (lo aplazado entra solo en la memoria): cuando `specty check --all` corre fuera de la CI, cada verificación que falla o avisa queda en la memoria de Specty como una mejora, sin que el agente la anote, y la entrada se marca hecha sola cuando un `check --all` posterior pasa esa verificación. Hoy el informe de `check --all` no deja nada: la deuda que nadie arregla en el momento se olvida.

## Fuera de alcance

- Los hallazgos de `specty review`: son el último corte de P31, que lo resuelve.
- El JSON de `check --all`: no cambia, porque es el de la CI, que no escribe en la memoria.
- Los modos `--changed` y `--staged`: lo que encuentran es del cambio en curso, y `task done` ya no deja completar con fallos.
- Una entrada por hallazgo: la deuda es de la verificación entera; sus hallazgos los da `specty check --all --verbose`.

## Supuestos

- A1: Una mejora (`improvement`) por verificación con fallos o avisos, con un texto fijo que solo nombra la verificación, sin cuentas ni rutas, que cambian con cada edición: «Deuda de `specty check --all`: la verificación `<id>` tiene hallazgos en el repositorio. Para verlos, `specty check --all --verbose`; Specty marca esta entrada hecha cuando la verificación pasa.». Así, la siguiente ejecución la reconoce por su texto, en español o en inglés.
  - impacto: alto
- A2: La deuda de una verificación no se repite mientras haya una entrada con su texto que no esté hecha: abierta, tomada por un cambio, propuesta para descartar o descartada. Una descartada no vuelve, porque la persona decidió no seguirla; una hecha sí, porque la deuda volvió.
  - impacto: alto
- A3: Un `check --all` que pasa una verificación marca hecha la entrada abierta de su deuda, cerrada por quien lo ejecuta. Una tomada por un cambio la cierra ese cambio al cerrarse, como hoy, y una propuesta para descartar la decide la persona. Una verificación que no corrió (sin su herramienta, o con nivel `off`) no anota ni cierra nada.
  - impacto: alto
- A4: La CI es la variable de entorno `CI` con cualquier valor que no sea vacío, `false` ni `0`, como la ponen GitHub Actions, GitLab CI y las demás plataformas. Allí la rama de la memoria no está y la máquina se tira al acabar.
- A5: El origen de la entrada es quien ejecuta `check --all` (el agente que Specty detecta o la persona), sin cambio: la deuda es del repositorio, no del cambio de la carpeta. Los commits de la memoria llevan los trailers de siempre.
- A6: La salida de `check --all` dice qué entradas anotó y cuáles marcó hechas, en una línea cada una, tras la línea del resumen; sin ninguna, nada.

## Criterios de aceptación

- AC1: CUANDO `specty check --all` corre fuera de la CI y una verificación falla o avisa ENTONCES la memoria gana una mejora de esa verificación con el texto fijo de su deuda, y la salida nombra las entradas que anotó.
- AC2: CUANDO la deuda de esa verificación ya está en la memoria sin hacer, abierta o descartada ENTONCES `check --all` no la repite.
- AC3: CUANDO un `check --all` posterior pasa esa verificación ENTONCES la entrada abierta de su deuda queda hecha, y la salida nombra las entradas que marcó hechas.
- AC4: CUANDO `check` corre en la CI (`CI=true`) o en el modo `--changed` ENTONCES no escribe en la memoria ni añade líneas a su salida.

## Diseño

- Core, `cards/check-debt.ts`:
  - `checkDebt(report, entries, lang)`: los textos de la deuda que anotar (las verificaciones `failed` o `warned` sin una entrada no hecha con su texto en algún idioma) y las entradas que marcar hechas (mejoras abiertas con el texto de una verificación `passed`, en algún idioma).
  - `checkDebtLines(added, done, lang)`: las líneas de la salida.
- CLI:
  - `flow/check-debt.ts`: `inCi(env)` y `keepCheckDebt(session, report)`, que lee la memoria, anota y marca hechas, un commit cada una y comprobando de nuevo cada una dentro de `editMemory`, como `harvestEntries`. Devuelve las líneas.
  - `commands/check.ts`: con `--all` y fuera de la CI, tras el informe, llama a `keepCheckDebt` y añade sus líneas a la salida de texto.
  - `commands/memory.ts`: exporta `writerOf`, el destino y el autor de las escrituras de la memoria, como ya lo usa `memory-drop.ts`.
- Los tests de la CLI quitan `CI` del entorno, como las demás variables de la máquina: en GitHub Actions vale `true`, y cada test que ejecuta `check --all` dejaría de escribir.

## Archivos

- crear packages/core/src/cards/check-debt.ts — qué deuda anotar y cuál marcar hecha, y las líneas de la salida
- modificar packages/core/src/cards/index.ts — exporta sus funciones
- crear packages/core/test/cards/check-debt.test.ts — deuda de las que fallan o avisan, sin repetir, hecha al pasar, en español y en inglés
- crear packages/cli/src/flow/check-debt.ts — anota y marca hecha la deuda en la memoria, y detecta la CI
- modificar packages/cli/src/commands/check.ts — `--all` fuera de la CI guarda su deuda y lo dice
- modificar packages/cli/src/commands/memory.ts — exporta `writerOf`
- crear packages/cli/test/check-debt.test.ts — `check --all` anota, no repite, marca hecha y no escribe en la CI ni con `--changed`
- modificar packages/cli/test/support.ts — los tests no heredan `CI` de la máquina
- modificar packages/cli/test/check-code-rules.test.ts — su `check --all` que falla ya nombra la deuda anotada
- modificar docs/checks.md — `--all` guarda su deuda en la memoria
- modificar docs/checks.en.md — lo mismo, en inglés
- modificar docs/ARCHITECTURE.md — la deuda de `check --all` entra en la memoria

## Tareas

- [x] T1: Qué deuda anotar y cuál marcar hecha
  - files: packages/core/src/cards/check-debt.ts, packages/core/src/cards/index.ts, packages/core/test/cards/check-debt.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/check-debt.test.ts && pnpm lint
- [ ] T2: `check --all` guarda su deuda en la memoria
  - files: packages/cli/src/flow/check-debt.ts, packages/cli/src/commands/check.ts, packages/cli/src/commands/memory.ts, packages/cli/test/check-debt.test.ts, packages/cli/test/support.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-debt.test.ts test/check.test.ts test/memory.test.ts && pnpm typecheck && pnpm lint && pnpm exec knip
- [ ] T3: La documentación, y el `check --all` de code-rules que nombra su deuda
  - files: packages/cli/test/check-code-rules.test.ts, docs/checks.md, docs/checks.en.md, docs/ARCHITECTURE.md
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/check-code-rules.test.ts && pnpm lint

## Riesgos

- R1: Entradas de más en un repositorio con mucha deuda — una sola por verificación, no por hallazgo, y la persona puede descartarlas con `specty memory drop` sin que vuelvan.
- R2: `check --all` algo más lento — una lectura de la memoria y un commit por entrada que cambia, y solo cuando cambia alguna.
