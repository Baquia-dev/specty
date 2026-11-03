---
kind: standard
---

# init y next avisan de las herramientas que ven las worktrees

## Objetivo

Hoy solo `specty doctor` dice qué herramientas de la raíz ven lo que escribe Specty (`.specty/`, los hooks y las worktrees de `.worktrees/`) y qué añadirles, y casi nadie lo ejecuta. Según la decisión D2 de la memoria («Specty detecta, el agente corrige y la persona aprueba»), Specty no edita esas configuraciones. Lo que sí hace es mostrar el aviso donde el agente lo ve: en la tarjeta de `specty next` sin cambio activo, que también es la del inicio de una sesión, y al terminar `specty init`, antes del primer cambio. El aviso incluye cómo crear el cambio que las corrige.

## Fuera de alcance

- Editar las configuraciones de las herramientas: lo hace el agente en un cambio, si el usuario lo pide (D2).
- Cambiar lo que comprueba `doctor` o cuándo lo hace: sigue avisando de `.worktrees/` solo una vez que existe.
- El modo de prueba de `init` (`--dry-run`).
- Detectar herramientas nuevas.

## Supuestos

- A1: Las comprobaciones de `doctor` (`formatterExclusions` y `worktreeExclusions`) leen unos pocos archivos de la raíz, así que `next` las puede ejecutar sin cambio activo sin hacerse notar.
  - impacto: alto
- A2: Al terminar `init` todavía no existe `.worktrees/`. Los cambios irán ahí cuando `git.worktrees` y `git.branchPerChange` estén activos (lo están por defecto), así que `init` avisa por adelantado en ese caso.
- A3: El texto de cada herramienta es el mismo que ya da `doctor` («X también revisa Y, que escribe Specty: añade Z en W.»), para que la persona y el agente reconozcan el aviso en los tres sitios.

## Criterios de aceptación

- AC1: CUANDO no hay un cambio activo y una herramienta de la raíz no excluye lo que escribe Specty (Biome sin `!.specty`; Vitest sin `.worktrees/` una vez que existe esa carpeta) ENTONCES la tarjeta de `specty next` añade el bloque «HERRAMIENTAS QUE VEN LO QUE ESCRIBE SPECTY». El bloque lleva la línea de `doctor` de cada herramienta y cómo crear el cambio que las corrige (`new "Las herramientas no ven lo que escribe Specty"`), y su SIGUIENTE no cambia.
- AC2: CUANDO todas las herramientas lo excluyen, o en la carpeta de un cambio activo, ENTONCES `next` no añade ese bloque.
- AC3: CUANDO `specty init` termina en un proyecto cuyos cambios irán a `.worktrees/` (la configuración por defecto), aunque aún no haya ninguno, ENTONCES su tarjeta añade el mismo bloque para cada herramienta que no excluye `.worktrees/`. CUANDO la configuración tiene `git.worktrees: false` ENTONCES no nombra `.worktrees/`.

## Diseño

- `packages/core/src/cards/exclusions.ts` (nuevo):
  - `ExclusionView` (`name`, `path`, `add`, `file`) y `exclusionLine`, el texto que comparten `doctor`, `next` e `init`.
  - `exclusionsBlock(exclusions, ctx, closing)` da el bloque y su línea final, que cambia según la tarjeta. En `next`, que lee el agente: «díselo al usuario; si quiere que lo corrijas, es un cambio como cualquier otro». En `init`: «se corrige en un cambio, como cualquier otro».
- `NextView.exclusions` e `InitView.exclusions`, opcionales. `nextCard` pone el bloque sin cambio activo, antes de la memoria; `initCard`, tras los avisos.
- `detect/formatters.ts`:
  - `toolExclusions(root, ahead = false)` reúne las de los formateadores y las de las worktrees, como hacía `doctor`.
  - Con `ahead`, la entrada `.worktrees/` de Biome y Prettier cuenta aunque la carpeta no exista todavía.
- `worktreeExclusions(root, ahead = false)` deja de exigir que exista `.worktrees/` cuando `ahead` está activo.
- Uso en los comandos:
  - `doctor` llama a `toolExclusions(root)` y sigue igual.
  - `next` sin cambio activo pasa las exclusiones que faltan.
  - `init` usa `ahead = git.worktrees && git.branchPerChange` de su configuración.
- El inicio de sesión de cada agente ya muestra lo que imprime `next`, así que no cambia.

## Archivos

- crear packages/core/src/cards/exclusions.ts — la línea de cada herramienta y el bloque de `next` e `init`
- modificar packages/core/src/cards/next.ts — `NextView.exclusions` y su bloque sin cambio activo
- modificar packages/core/src/cards/init.ts — `InitView.exclusions` y su bloque
- modificar packages/core/src/cards/doctor.ts — usa la línea compartida
- modificar packages/cli/src/detect/formatters.ts — `toolExclusions` y `ahead` para `.worktrees/`
- modificar packages/cli/src/detect/worktree-tools.ts — `ahead` en `worktreeExclusions`
- modificar packages/cli/src/commands/doctor.ts — usa `toolExclusions`
- modificar packages/cli/src/commands/next.ts — las exclusiones que faltan, sin cambio activo
- modificar packages/cli/src/commands/init.ts — las exclusiones que faltan, por adelantado
- crear packages/core/test/cards/exclusions.test.ts — el bloque de cada tarjeta, en español e inglés
- crear packages/cli/test/exclusion-warnings.test.ts — los avisos de `next` e `init`
- modificar docs/decisions/0018-worktrees-dentro-del-repositorio.md — la decisión: `init` y `next` avisan y el agente corrige en un cambio
- modificar docs/ARCHITECTURE.md — lo que muestran `next` sin cambio activo e `init`

## Tareas

- [x] T1: Las tarjetas de `next` e `init` llevan el bloque de las herramientas, con la línea de `doctor`
  - files: packages/core/src/cards/exclusions.ts, packages/core/src/cards/next.ts, packages/core/src/cards/init.ts, packages/core/src/cards/doctor.ts, packages/core/test/cards/exclusions.test.ts
  - ac: AC1, AC3
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/cards/exclusions.test.ts test/cards/doctor.test.ts
- [x] T2: `next` sin cambio activo e `init` pasan las exclusiones que faltan, y la documentación
  - files: packages/cli/src/detect/formatters.ts, packages/cli/src/detect/worktree-tools.ts, packages/cli/src/commands/doctor.ts, packages/cli/src/commands/next.ts, packages/cli/src/commands/init.ts, packages/cli/test/exclusion-warnings.test.ts, docs/decisions/0018-worktrees-dentro-del-repositorio.md, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm --filter @baquia-dev/specty exec vitest run test/exclusion-warnings.test.ts test/doctor-worktrees.test.ts

## Riesgos

- R1: Algún test existente de `next` o `init` usa archivos de Biome o Prettier sin las exclusiones y compara la salida entera; el bloque nuevo lo rompería. Mitigación: el `pnpm check` de `accept` los ejecuta todos, y se ajusta el archivo de prueba, no el aviso.
- R2: El bloque se repite en cada inicio de sesión hasta que se corrige. Es intencionado: desaparece en cuanto la herramienta excluye la carpeta.

## Cierre

### Resumen

Las herramientas de la raíz que ven lo que escribe Specty ya no solo aparecen en `specty doctor`. Las listan también, en el bloque «HERRAMIENTAS QUE VEN LO QUE ESCRIBE SPECTY» y con la misma línea de `doctor`:

- la tarjeta de `next` sin cambio activo, que es también la del inicio de cada sesión, con el `specty new "Las herramientas no ven lo que escribe Specty"` del cambio que las corrige si el usuario lo pide;
- la de `init`, antes del primer cambio, cuando los cambios irán a `.worktrees/`.

`toolExclusions` (`detect/formatters.ts`) reúne las de los formateadores y las de las worktrees para los tres comandos. Con `ahead`, cuenta `.worktrees/` aunque aún no exista. `cards/exclusions.ts` tiene la línea y el bloque de cada tarjeta. El ADR 0018 recoge la decisión D2 («Specty detecta, el agente corrige y la persona aprueba») y su consecuencia, y ARCHITECTURE, lo que muestran `next` e `init`. `pnpm check` en verde; los tests ejecutan el 100 % de las líneas añadidas.

### Desviaciones

- La tarea única se dividió en dos porque tocaba 12 archivos. La documentación va en T2, porque la política `contract` pide tests en cada tarea.

### Decisiones

- `doctor` sigue avisando de `.worktrees/` solo cuando la carpeta existe (su AC3 anterior). `next` usa esa misma regla, y solo `init` avisa por adelantado, según `git.worktrees` y `git.branchPerChange`.
- La línea final cambia según la tarjeta. En `next`, que lee el agente, le pide decírselo al usuario y le da el `new` con `--request`. En `init`, que puede ejecutar la persona, explica cómo se corrige.
- En `next` el bloque va antes de la memoria y no cambia el SIGUIENTE.

### Pendientes

- `packages/core/src/cards/init.ts` ya pasaba del aviso de tamaño (374 líneas de código; este cambio añade 3). Queda por proponer cómo dividirlo por responsabilidad.
- Descartar D1 y P55 de la memoria de Specty: quedaron propuestas, y solo la persona las descarta.
