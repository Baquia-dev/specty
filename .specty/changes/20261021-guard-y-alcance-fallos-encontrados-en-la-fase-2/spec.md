---
kind: standard
---

# Guard y alcance: fallos encontrados en la fase 2

## Objetivo

Corregir cinco fallos de Specty encontrados al construir el sistema de diseño. El guard bloqueaba acciones legítimas: escrituras fuera del repositorio, rutas relativas tras un `cd` y rutas que git ignora. El alcance implícito no reconocía los tests de un monorepo (`packages/x/test/` frente a `packages/x/src/`). Y `.specty/` rompía el formateador del repositorio sin que `doctor` lo avisara.

## Fuera de alcance

- Que `init` modifique por su cuenta la configuración de Biome o Prettier: solo avisa `doctor`.
- Expandir variables de shell o interpretar scripts: el guard sigue siendo de mejor esfuerzo.
- Otros adaptadores de herramientas o cambios en los hooks de git.

## Supuestos

- A1: Una ruta que el guard no puede resolver no se bloquea por alcance: una ruta con variables sin expandir (`$S/a.css`), o una ruta relativa tras un `cd` a un destino desconocido. La capa 3 (hooks de git) y el CI siguen cubriéndolas, y esto encaja con el modelo de confianza (ARCHITECTURE §10).
  - impacto: alto
- A2: Lo que git ignora no es código gobernado. Así coincide con `task done`, que tampoco lo ve.
- A3: Basta con detectar Biome (`biome.json` o `biome.jsonc`) y Prettier (`.prettierrc*`, `prettier.config.*` o la clave `prettier` en `package.json`). `.specty` está excluido si aparece en `files.includes` con `!` (Biome) o en `.prettierignore`.

## Criterios de aceptación

- AC1: CUANDO una tarea con `packages/x/src/a/b.ts` en su alcance toca `packages/x/test/a/b.test.ts` ENTONCES el alcance lo admite como test implícito, igual que `test/a/b.test.ts` para `src/a/b.ts`.
- AC2: CUANDO un comando hace `cd <dir>` y después escribe o borra una ruta relativa ENTONCES el guard la resuelve contra `<dir>`: si queda fuera del repositorio la permite, y si queda dentro y fuera del alcance la bloquea nombrando esa ruta.
- AC3: CUANDO un comando escribe o borra una ruta con variables sin expandir, o una ruta relativa tras un `cd` a un destino desconocido, ENTONCES el guard no la bloquea por alcance.
- AC4: CUANDO durante una tarea un comando o una herramienta escribe o borra rutas que git ignora (por ejemplo `node_modules/.cache/…`) ENTONCES el guard no las bloquea.
- AC5: CUANDO el repositorio usa Biome o Prettier y no excluye `.specty/` ENTONCES `specty doctor` lo señala como problema, con la línea exacta que hay que añadir; CUANDO ya lo excluye ENTONCES lo da por bueno.

## Diseño

- `analyzeShell` (core) recorre los segmentos en orden y lleva el directorio actual:
  - `cd <dir>` lo actualiza; un destino absoluto lo reemplaza;
  - `cd` sin argumentos, `cd -` o un destino con `$`, `~` o comillas sin resolver lo vuelven desconocido;
  - cada escritura y cada borrado sale como `{ path, base }`, con `base` relativo al directorio del evento o `undefined` si es desconocido;
  - una ruta con `$` también sale como desconocida.
- `guard.ts` (cli):
  - resuelve cada ruta contra `cwd + base`;
  - descarta las desconocidas y las de fuera del repositorio;
  - pregunta a git cuáles están ignoradas (`git check-ignore --stdin`) y las descarta antes de decidir.

  Lo mismo vale para las rutas de Write y Edit.
- `subjectDirectories` (core) busca el primer segmento espejo (`test`, `tests`, `spec`…) a cualquier profundidad y conserva el prefijo: `packages/x/test/a` → `packages/x/src/a`, `packages/x/lib/a`, `packages/x/app/a` y `packages/x/a`.
- `detect/formatters.ts` (cli) detecta Biome y Prettier y si excluyen `.specty`, y `doctor` añade la comprobación. Se excluye `.specty/` en lugar de que Specty imite cada formateador: el estado lo escribe Specty y no lo edita nadie más.
- Documentación (rutas libres):
  - ARCHITECTURE §10: el guard ignora lo que git ignora y lo que no puede resolver;
  - formats.md §6: nota sobre excluir `.specty/` del formateador.

## Archivos

- modificar packages/core/src/scope/tests.ts — espejo `test/` → `src/` a cualquier profundidad
- modificar packages/core/test/scope/scope.test.ts — casos de monorepo
- modificar packages/core/src/guard/shell.ts — seguir `cd` y marcar rutas sin resolver
- modificar packages/core/test/guard/shell.test.ts — casos de `cd` y variables
- modificar packages/cli/src/enforce/guard.ts — resolver cada ruta con su base y descartar las ignoradas
- modificar packages/cli/src/io/git.ts — consultar `git check-ignore`
- modificar packages/cli/test/enforce.test.ts — casos end-to-end del guard
- crear packages/cli/src/detect/formatters.ts — formateadores que revisarían `.specty/`
- modificar packages/cli/src/commands/doctor.ts — aviso del formateador
- modificar packages/cli/test/install.test.ts — casos de `doctor`

## Tareas

- [x] T1: Tests implícitos en monorepos
  - files: packages/core/src/scope/tests.ts, packages/core/test/scope/scope.test.ts
  - ac: AC1
  - verify: pnpm --filter @baquia-dev/specty-core test
  - type: fix
- [ ] T2: El análisis de shell sigue `cd` y marca lo que no puede resolver
  - files: packages/core/src/guard/shell.ts, packages/core/test/guard/shell.test.ts
  - ac: AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty-core test
  - type: fix
- [ ] T3: El guard resuelve cada ruta con su directorio y respeta lo que git ignora
  - files: packages/cli/src/enforce/guard.ts, packages/cli/src/io/git.ts, packages/cli/test/enforce.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty test
  - type: fix
  - notes: Incluye la nota de ARCHITECTURE §10.
- [ ] T4: doctor avisa si el formateador revisa .specty/
  - files: packages/cli/src/detect/formatters.ts, packages/cli/src/commands/doctor.ts, packages/cli/test/install.test.ts
  - ac: AC5
  - verify: pnpm check
  - notes: Incluye la nota de formats.md §6.

## Riesgos

- R1: Permitir lo que no se puede resolver (A1) abre un hueco: `cd "$X" && echo > archivo`. Mitigación: es mejor esfuerzo, como el resto del análisis de shell, y la capa 3 y el CI siguen bloqueando el commit sin recibo.
- R2: `git check-ignore` añade una llamada a git en cada acción que escribe, y el objetivo de rendimiento del guard es p95 < 200 ms. Mitigación: una sola llamada con todas las rutas por `--stdin`, y solo cuando hay rutas.
- R3: El guard en uso es `packages/cli/dist/specty.mjs`; hasta reconstruirlo, sigue con los fallos durante este cambio. Mitigación: los tests de las tareas van listados en Archivos, sin depender del alcance implícito.
