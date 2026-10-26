---
kind: standard
epic: 20261026-todos-los-agentes-al-nivel-de-claude-code
slice: C2
---

# La tabla de capacidades dice qué es directo, indirecto o no posible

## Objetivo

La tabla `AGENT_CAPABILITIES` y su copia en ARCHITECTURE §10 dicen hoy sí o no para tres capacidades, y no distinguen lo que falta por hacer de lo que la herramienta no permite. Cada capacidad pasa a tener un estado: «sí», «indirecto» (por otro evento de la herramienta, un poco más tarde), «no posible» (con su motivo), «pendiente» (lo hace un corte de la épica) o «—» (Specty no la ofrece: Copilot, fuera de la épica). La tabla suma el fin de turno, la exclusión, los permisos y la prueba de extremo a extremo, y queda con la verdad de hoy. Así cada corte siguiente cambia las celdas de su herramienta, y C13 quita «pendiente».

## Fuera de alcance

- Cambiar lo que Specty hace con cualquier agente: solo cambia la tabla y su texto.
- Quitar el estado «pendiente», que es C13.
- Las tablas de detalle de §10 (soporte de hooks, fin de turno y exclusión de ruido), que siguen como están.

## Supuestos

- A1: Solo leen la tabla los tipos del guard (`GuardedAgent`, de los agentes con guard «sí»), la detección (por sus `markers`), la prueba que la compara con ARCHITECTURE §10 y `agents.test.ts`, así que el cambio de forma no toca la CLI.
- A2: La verdad de hoy es la de la épica: Claude Code tiene «sí» en todo; «worktree por nombre» es «no posible» fuera de Claude Code; la prueba de extremo a extremo es «no posible» en Cursor y Antigravity (su modelo va siempre por su servidor) y en Windsurf (no tiene CLI); la exclusión es «no posible» en Codex (lee por la shell); en Windsurf, el fin de turno y la tarjeta tras compactar son «no posible»; los permisos son «sí» en Claude Code y Codex (sus reglas) y en OpenCode (no tiene sandbox ni clasificador); lo demás que la épica hará es «pendiente».
  - impacto: alto
- A3: Los motivos y los «cómo» van en español y en inglés dentro de `capabilities.ts`, como el resto del texto de la tabla, que ya está allí y no en `cards/`.

## Criterios de aceptación

- AC1: CUANDO se lee la tabla de ARCHITECTURE §10 ENTONCES cada herramienta muestra, en guard, aviso tras cada comando, tarjeta tras compactar, worktree por nombre, fin de turno, exclusión, permisos y prueba de extremo a extremo, uno de «sí», «indirecto», «no posible», «pendiente» o «—».
- AC2: CUANDO una capacidad es «no posible» o «indirecto» ENTONCES debajo de la tabla se lee, para esa herramienta y esa capacidad, por qué no se puede o cómo se hace, en español y en inglés.
- AC3: CUANDO la tabla de ARCHITECTURE §10 no coincide con `AGENT_CAPABILITIES` ENTONCES la prueba de core falla.
- AC4: CUANDO una herramienta tiene el guard en «sí» ENTONCES es una de las que atiende el guard (`GuardedAgent`), y ninguna otra lo es.

## Diseño

- `Support`, en `capabilities.ts`: `{ state: "yes" }`, `{ state: "indirect", how }`, `{ state: "impossible", why }`, `{ state: "pending" }` o `{ state: "unsupported" }`, con `how` y `why` como `{ es, en }`.
- `AgentCapabilities` cambia sus booleanos por `Support` y suma `endOfTurn`, `exclusion`, `permissions` y `endToEnd`. El guard también pasa a ser un `Support`: `GuardedAgent` y `isGuardedAgent` miran si es «sí». `GuardSurface` desaparece, porque el guard siempre va en el repositorio (ADR 0013).
- Unas constantes (`yes`, `pending`, `unsupported`) y los motivos que se repiten (sin `EnterWorktree`, el modelo en su servidor) mantienen la tabla corta.
- `capabilityTable(lang)` dibuja la tabla con una columna por capacidad y, debajo, dos listas: «Indirecto» y «No posible», con una línea por herramienta y capacidad. Una lista vacía no se dibuja.

## Archivos

- modificar packages/core/src/capabilities.ts — el estado de cada capacidad, las columnas nuevas y la tabla con sus motivos
- modificar packages/core/src/index.ts — exporta `Support` y deja de exportar `GuardSurface`
- modificar packages/core/test/capabilities.test.ts — las filas que espera cambian con la forma nueva de la tabla (AC1), y comprueba los motivos (AC2) y los agentes con guard (AC4)
- modificar docs/ARCHITECTURE.md — la tabla nueva y qué quiere decir cada estado

## Tareas

- [x] T1: Cada capacidad con su estado y su motivo
  - files: packages/core/src/capabilities.ts, packages/core/src/index.ts, packages/core/test/capabilities.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/capabilities.test.ts && pnpm --filter @baquia-dev/specty exec vitest run test/agents.test.ts

## Riesgos

- R1: Con diez columnas, la tabla se lee mal en un editor estrecho. Mitigación: los motivos y los «cómo» van en listas debajo, y las celdas solo dicen el estado.
