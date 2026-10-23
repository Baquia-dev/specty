---
kind: standard
---

# Avisos de archivos compartidos entre cambios

## Objetivo

Specty avisa cuando un cambio planea tocar archivos que otro cambio abierto, en otra worktree, también lista. Así el posible conflicto se ve al planificar, y no al cerrar, cuando ya hay que resolverlo. Avisa en `propose`, para que el agente pueda replantear; en `approve`, para que la persona lo vea antes de decidir; y en `scope add`, al ampliar el alcance. Hoy dos cambios en paralelo solo descubren que comparten archivos cuando el segundo choca al incorporarse.

## Fuera de alcance

- Bloquear la aprobación por compartir archivos: solo se avisa.
- Comparar las líneas que tocará cada cambio: se compara por archivo.
- La UI.

## Supuestos

- A1: Cuentan los archivos gobernados de la sección Archivos de cada cambio abierto (las dos rutas de un renombrado), más las ampliaciones de alcance aprobadas. Una ruta con comodines coincide con las rutas que encaja. La documentación y lo demás que no es gobernado no cuenta, porque casi nunca da un conflicto que el merge no resuelva solo y avisar de ello sería ruido.
- A2: Solo se comparan los cambios abiertos de las otras worktrees, cada uno leído en su propia carpeta, como hace `status`. Un cambio ya cerrado, o la copia que una rama heredó de otro, no cuenta.
- A3: Avisar no cambia nada más: la spec sigue siendo válida, `approve` aprueba igual y `scope add` decide igual.

## Criterios de aceptación

- AC1: CUANDO se propone una spec cuyos archivos lista también otro cambio abierto ENTONCES la salida de `propose` añade «ARCHIVOS COMPARTIDOS», con cada archivo y los cambios que también lo tocan, y la spec sigue siendo válida.
- AC2: CUANDO la persona aprueba esa spec ENTONCES el resumen que ve antes de decidir incluye los archivos compartidos.
- AC3: CUANDO `scope add` pide un archivo que otro cambio abierto lista ENTONCES su salida añade el aviso, tanto si la ampliación se aprueba sola como si queda pendiente.
- AC4: CUANDO los archivos solo coinciden en documentación, o el otro cambio ya está cerrado, ENTONCES no hay aviso.

## Diseño

- `flow/shared.ts` (nuevo):
  - `sharedFiles(session, id, paths)` recorre los cambios abiertos de las otras worktrees (`locateChanges`), lee de cada uno su sección Archivos y sus ampliaciones aprobadas, y devuelve, para cada ruta gobernada de `paths` que coincide, los cambios que también la listan.
  - Las coincidencias van en los dos sentidos, con `matchesAny`, para que una ruta con comodines encaje con una concreta.
  - `sharedBlock(session, shared)` arma el bloque «ARCHIVOS COMPARTIDOS» de la salida.
- `commands/propose.ts`: añade el bloque a la tarjeta de la spec propuesta.
- `commands/approve.ts`: añade las líneas al resumen que se muestra antes de decidir.
- `commands/scope.ts`: añade el bloque a la salida de `scope add`.

## Archivos

- crear packages/cli/src/flow/shared.ts — archivos que otros cambios abiertos también listan
- modificar packages/cli/src/commands/propose.ts — aviso al proponer
- modificar packages/cli/src/commands/approve.ts — aviso antes de aprobar
- modificar packages/cli/src/commands/scope.ts — aviso al ampliar el alcance
- crear packages/cli/test/shared.test.ts — pruebas de punta a punta con dos worktrees
- modificar docs/ARCHITECTURE.md — §8: avisos de archivos compartidos

## Tareas

- [x] T1: Archivos compartidos al proponer y al aprobar
  - files: packages/cli/src/flow/shared.ts, packages/cli/src/commands/propose.ts, packages/cli/src/commands/approve.ts, packages/cli/test/shared.test.ts
  - ac: AC1, AC2, AC4
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/shared.test.ts test/flow.test.ts
- [x] T2: Archivos compartidos al ampliar el alcance
  - files: packages/cli/src/commands/scope.ts, packages/cli/src/flow/shared.ts, packages/cli/test/shared.test.ts
  - ac: AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/shared.test.ts test/commands.test.ts
- [x] T3: Documentar los archivos compartidos
  - files: docs/ARCHITECTURE.md
  - ac: —
  - verify: pnpm check
  - type: docs

## Riesgos

- R1: Muchas worktrees hacen más lento `propose` — solo se leen la spec y el estado de cada cambio, sin ejecutar nada.

## Cierre

### Resumen

`propose`, `approve` y `scope add` avisan, en un bloque «ARCHIVOS COMPARTIDOS», cuando un archivo gobernado del cambio aparece también en la sección Archivos (las dos rutas de un renombrado), o en las ampliaciones aprobadas, de otro cambio abierto de otra worktree, cada uno leído en su propia carpeta. Las rutas con comodines encajan en los dos sentidos. La documentación no cuenta, ni un cambio ya cerrado o cancelado. `approve` muestra los archivos compartidos en el resumen que la persona ve antes de decidir. `scope add` los muestra tanto si la ampliación se aprueba sola como si queda pendiente. Solo se avisa: la spec sigue siendo válida y las decisiones no cambian.

### Desviaciones

- **`scope add` reutiliza `listed()`** de `flow/shared.ts` para las rutas de la sección Archivos, que antes calculaba por su cuenta.
- **Las pruebas cancelan un cambio ya aprobado:** cancelar uno que aún no se había aprobado falla (ver Pendientes).

### Decisiones

- **En `propose` se avisa al proponer la spec, no al proponer el cierre.**
- **La comparación es por archivo:** no se mira qué líneas tocará cada cambio.

### Pendientes

- **Un fallo de `cancel` encontrado al probar:** si el cambio nunca se aprobó, su carpeta nunca entró en git, y al archivar `git add -A -- <carpeta antigua>` falla («pathspec did not match»). Va en un cambio aparte, el siguiente.
- **Recompilar el CLI de la carpeta principal** cuando esto esté en `main`.
