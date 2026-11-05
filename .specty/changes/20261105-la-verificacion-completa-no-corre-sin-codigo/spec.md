---
kind: standard
---

# La verificación completa no corre cuando el cambio no toca código

## Objetivo

Hoy `accept` ejecuta la verificación completa aunque el cambio solo toque documentación o archivos de `.specty/`, y la incorporación de main la ejecuta otra vez cada vez que main avanzó, aunque el código que resulta sea el mismo que el de main. Además, el `tree` con el que `accept` reutiliza una verificación que ya pasó cuenta también la documentación: corregir un documento tras verificar obliga a repetirla. Con varias sesiones en paralelo, cada una de esas ejecuciones son minutos de máquina y de cola. Con este cambio, la verificación completa (la de `accept` y la de la incorporación) no corre cuando el cambio no toca código, y lo dice; y el `tree` solo cuenta el código, así que un cambio en un archivo libre no obliga a repetir una verificación que ya pasó.

## Fuera de alcance

- Saltar la verificación de una tarea: cada tarea sigue ejecutando su `verify`, que elige el agente.
- Verificar solo los paquetes o los tests que toca el cambio, o recordar verificaciones de otros cambios (puntos 6 y 8 del plan).
- Cambiar qué archivos son libres: siguen siendo los de `ignored` y `.specty/`.

## Supuestos

- A1: Los archivos de `.specty/` y los de `ignored` (aquí, `**/*.md` y `docs/**`) no cambian el resultado de la verificación completa. Un test que lea uno de ellos (aquí, `capabilities.test.ts` lee `docs/ARCHITECTURE.md`) no vuelve a correr si solo cambia ese archivo; el CI lo ejecuta todo en cada push.
  - impacto: alto
- A2: Si el cambio no toca código, tras incorporar main el código es el de main, que verificó el cierre que lo integró. Un commit hecho a mano en main no pasó por esa verificación, pero tampoco es de este cambio.
  - impacto: alto
- A3: Es código todo archivo fuera de `.specty/` y de `ignored`, aunque no esté en `governed`: un `package.json` fuera de `governed` cambia igual lo que verifican los tests.
- A4: Sin incorporación (modo equipo, un cambio sin rama, un spike) no se salta nada: no hay rama destino con la que comparar.
- A5: El `tree` de las verificaciones anotadas antes de este cambio deja de coincidir una vez: la primera verificación completa tras actualizar Specty corre.

## Criterios de aceptación

- AC1: CUANDO un cambio solo toca archivos libres (`ignored` o `.specty/`) ENTONCES `accept` no ejecuta la verificación completa y su nota dice que el cambio no toca código.
- AC2: CUANDO main avanzó y se incorpora a un cambio que solo toca archivos libres ENTONCES la incorporación no ejecuta la verificación y su línea dice que el cambio no toca código.
- AC3: CUANDO un cambio toca un archivo de código y main avanzó ENTONCES la incorporación ejecuta la verificación completa, como hoy.
- AC4: CUANDO la verificación completa pasó y después solo cambia un archivo libre ENTONCES `accept` no la repite.
- AC5: CUANDO la nota de `accept` o la línea de la incorporación dicen que el cambio no toca código ENTONCES lo dicen en español y en inglés.

## Diseño

- `core/cards/accept.ts`: `noCodeVerificationNote(command, target, lang)`, con el mismo título que `verificationReusedNote`: la verificación completa no corre porque el cambio no toca código respecto a `target`, solo archivos libres.
- `core/cards/integration.ts`: `MergeVerification` suma `{ kind: "no-code" }`, y `absorbedLine` dice «sin verificar: el cambio no toca código, así que el código es el de main».
- `cli/flow/verified.ts`: `codeTree` hashea `ls-tree -r` del árbol de trabajo, solo con las rutas que son código (`isGoverned(ruta, { governed: ["**"], ignored })`). Nuevo `touchesCode(session, target)`: si alguna ruta de código difiere entre `target` y el árbol de trabajo (`git diff --name-only <target> <árbol>`, también lo que no está en un commit).
- `cli/flow/integrate.ts`: tras el merge sin conflictos, si `touchesCode` es falso no verifica, y `commitAbsorbed` dice `no-code`.
- `cli/commands/accept.ts`: `mergeFirst` devuelve también el plan de la incorporación; `verificationToRun` no ejecuta la verificación completa si hay plan y `touchesCode(session, plan.target)` es falso, y saca la nota.

## Archivos

- modificar packages/core/src/cards/accept.ts — la nota de cuando el cambio no toca código
- modificar packages/core/src/cards/integration.ts — la línea de la incorporación sin código
- modificar packages/core/src/cards/index.ts — exportar la nota
- modificar packages/core/test/cards/accept.test.ts — AC5
- modificar packages/core/test/cards/incorporation.test.ts — AC5
- modificar packages/cli/src/flow/verified.ts — el `tree` solo con el código, y si el cambio toca código
- modificar packages/cli/test/reuse.test.ts — AC4
- modificar packages/cli/src/flow/integrate.ts — la incorporación sin código no verifica
- modificar packages/cli/src/commands/accept.ts — accept no verifica un cambio sin código
- crear packages/cli/test/no-code.test.ts — AC1, AC2 y AC3
- modificar docs/ARCHITECTURE.md — cuándo no corre la verificación completa
- modificar docs/formats.md — qué cuenta el `tree` de `task.verified` y `change.verified`

## Tareas

- [x] T1: La nota de accept y la línea de la incorporación dicen cuándo el cambio no toca código
  - files: packages/core/src/cards/accept.ts, packages/core/src/cards/integration.ts, packages/core/src/cards/index.ts, packages/core/test/cards/accept.test.ts, packages/core/test/cards/incorporation.test.ts
  - ac: AC5
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/accept.test.ts test/cards/incorporation.test.ts && pnpm --filter @baquia-dev/specty-core typecheck
  - type: perf
- [x] T2: El tree de una verificación solo cuenta el código
  - files: packages/cli/src/flow/verified.ts, packages/cli/test/reuse.test.ts
  - ac: AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/reuse.test.ts && pnpm --filter @baquia-dev/specty typecheck
  - type: perf
- [x] T3: accept y la incorporación no ejecutan la verificación completa en un cambio sin código
  - files: packages/cli/src/flow/verified.ts, packages/cli/src/flow/integrate.ts, packages/cli/src/commands/accept.ts, packages/cli/test/no-code.test.ts
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/no-code.test.ts test/reuse.test.ts test/integrate.test.ts test/close-moved.test.ts && pnpm typecheck && pnpm lint && pnpm knip
  - type: perf
- [ ] T4: La documentación de cuándo no corre la verificación completa
  - files: docs/ARCHITECTURE.md, docs/formats.md
  - ac: —
  - verify: pnpm lint
  - type: docs

## Riesgos

- R1: Un cambio de solo documentación que rompe un test que la lee llega a main sin verse — el CI ejecuta `pnpm check` en cada push y en cada pull request, y el siguiente `accept` que verifique lo verá fallar.
