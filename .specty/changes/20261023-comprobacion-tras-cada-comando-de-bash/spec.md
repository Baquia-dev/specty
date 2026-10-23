---
kind: standard
---

# Comprobación tras cada comando de Bash

## Objetivo

El guard ve lo que cambia un comando de Bash, no solo lo que su texto deja adivinar. Antes de cada comando, Specty anota qué archivos gobernados difieren de `HEAD`; al terminar, juzga con las reglas de siempre lo que el comando cambió (scripts, intérpretes, generadores, `npm run`…) y, si algo no estaba permitido, Claude Code recibe al momento el motivo y el paso siguiente, en lugar de descubrirlo en `specty task done` después de haber seguido trabajando encima.

## Fuera de alcance

- Cursor: su `postToolUse` solo añade contexto (`additional_context`); queda para otro cambio.
- Deshacer los cambios: el comando ya se ejecutó; el aviso explica qué hacer.
- Comprobar después las herramientas de edición (`Edit`, `Write`…): el guard ya las bloquea antes.
- Predecir desde el texto qué escribirá un script.

## Supuestos

- A1: Solo Claude Code, que con `PostToolUse` y, si el comando falla, `PostToolUseFailure` muestra al modelo el mensaje de un hook que sale con código 2 aunque la herramienta ya se haya ejecutado.
  - impacto: alto
- A2: Avisa, no bloquea: el cambio ya está hecho y la comprobación no puede impedirlo; `specty task done` sigue siendo la puerta y no avanza hasta que se resuelva.
  - impacto: alto
- A3: Solo cuenta lo que cambia durante el comando: la foto de antes guarda, por cada archivo gobernado que difiere de `HEAD`, su tamaño y su fecha de modificación, en `.git/specty/shell/<tool_use_id>.json`; lo que ya estaba cambiado y el comando no toca no se avisa. Dos comandos en paralelo, en la misma sesión o en otra sobre el mismo árbol, pueden atribuirse sus cambios, así que el aviso dice qué cambió y pide revisarlo antes de deshacerlo.
- A4: Los comandos de Specty (`specty task done`, `specty next`…) no se comprueban: escriben su estado y hacen sus commits como parte del flujo.
- A5: Sin foto (el primer comando tras instalar o un fallo del propio hook), la comprobación calla, igual que el guard ante sus errores; las fotos huérfanas se borran al cabo de un día.
- A6: Los repositorios ya configurados la reciben al volver a ejecutar `specty init`, que es idempotente; `specty doctor` avisa mientras falte.

## Criterios de aceptación

- AC1: CUANDO, con una tarea activa, un comando de Bash cambia un archivo gobernado fuera de su alcance (por ejemplo, un script que escribe `src/other.ts`) ENTONCES, al terminar, Claude Code recibe un aviso que nombra el archivo y propone deshacerlo o pedirlo con `specty scope add src/other.ts --task T1 --reason "<motivo>"`.
- AC2: CUANDO el comando no cambia nada, o solo archivos del alcance o que git ignora ENTONCES no hay aviso.
- AC3: CUANDO un archivo fuera del alcance ya estaba cambiado antes del comando y el comando no lo toca ENTONCES no se avisa.
- AC4: CUANDO un comando cambia código gobernado sin un cambio activo, fuera de la fase implementing o en archivos que gestiona Specty ENTONCES el aviso aplica las mismas reglas que el guard antes de una escritura.
- AC5: CUANDO el comando falla ENTONCES se comprueba igual.
- AC6: CUANDO el comando ejecuta Specty ENTONCES no se comprueba.
- AC7: CUANDO se ejecuta `specty init` con Claude Code ENTONCES instala la comprobación tras cada comando de Bash, y `specty doctor` avisa si falta.

## Diseño

- **Core** (`guard/after.ts`): `shellChanges(before, after)` compara dos fotos (ruta → huella) y devuelve lo que el comando escribió y borró; `decideAfterShell(cambios, ctx)` juzga cada ruta con `decideGuard` y reúne las denegaciones en un solo aviso. Las denegaciones de `decideGuard` llevan su regla (`scope`, `protected`, `phase`…), para que el aviso proponga `scope add` solo cuando sirve.
- **Foto** (`enforce/shell-snapshot.ts`): los cambios desde `HEAD` (`changedSince`), con el tamaño y la fecha de cada archivo; guardar, leer y borrar por `tool_use_id`, y borrar las de más de un día.
- **Guard** (`enforce/guard.ts`): `specty guard --tool claude-code` distingue el evento por `hook_event_name`. En `PreToolUse`, si permite un comando de Bash que no ejecuta Specty, guarda la foto; en `PostToolUse` y `PostToolUseFailure`, compara, decide y, si deniega, sale con código 2 y el aviso en stderr.
- **Instalación** (`install/agents.ts`): `PostToolUse` y `PostToolUseFailure` con el matcher `Bash` y la misma orden; `doctor` comprueba los tres eventos.

## Archivos

- modificar packages/core/src/guard/decide.ts — cada denegación lleva su regla
- crear packages/core/src/guard/after.ts — qué cambió un comando y cómo se juzga
- modificar packages/core/src/index.ts — exportar lo nuevo
- crear packages/core/test/guard/after.test.ts — tests de las fotos y del aviso
- crear packages/cli/src/enforce/shell-snapshot.ts — la foto del árbol antes de cada comando
- modificar packages/cli/src/enforce/guard.ts — foto antes, comprobación después
- modificar packages/cli/test/enforce.test.ts — la comprobación de punta a punta
- modificar packages/cli/src/install/agents.ts — los hooks PostToolUse y PostToolUseFailure
- modificar packages/cli/src/commands/doctor.ts — avisar si faltan
- modificar packages/cli/test/setup.test.ts — init y doctor con los hooks nuevos

## Tareas

- [x] T1: Qué cambió un comando y cómo se juzga
  - files: packages/core/src/guard/decide.ts, packages/core/src/guard/after.ts, packages/core/src/index.ts, packages/core/test/guard/after.test.ts
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/guard
- [x] T2: Foto antes y comprobación después de cada comando
  - files: packages/cli/src/enforce/shell-snapshot.ts, packages/cli/src/enforce/guard.ts, packages/cli/test/enforce.test.ts
  - ac: AC1, AC2, AC3, AC4, AC5, AC6
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/enforce.test.ts
  - notes: Medir el guard antes y después de un comando: p95 < 200 ms.
- [ ] T3: Instalar la comprobación y avisar si falta
  - files: packages/cli/src/install/agents.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/setup.test.ts
  - ac: AC7
  - verify: pnpm check
  - notes: Actualizar también docs/ARCHITECTURE.md §10 (capas, guard y tabla de hooks) y docs/formats.md §1 (`.git/specty/shell/`).

## Riesgos

- R1: Cada comando de Bash ejecuta Specty dos veces, antes y después — la foto usa las mismas consultas a git que `task done` y una lectura de fecha por archivo cambiado; T2 mide que ambos se queden por debajo de 200 ms.
- R2: Un aviso por cambios de otro comando en paralelo podría llevar al agente a deshacer trabajo ajeno — el aviso dice qué cambió y pide revisarlo antes de deshacerlo (A3).
