---
kind: standard
---

# doctor comprueba lo que dice: rutas citadas y versión de Node

## Objetivo

ARCHITECTURE §14 dice que `specty doctor` comprueba cinco cosas que el código no hace: que los comandos citados existen y funcionan, que las rutas citadas existen, el presupuesto de AGENTS.md, la versión de Node y la configuración de CI. Ahora `doctor` comprueba las dos que más sirven: avisa de las rutas que AGENTS.md cita y ya no existen, que llevarían al agente a archivos que se fueron, y da un problema si Node es anterior a la 22. Las otras tres salen del documento, y su lista pasa a decir lo que `doctor` hace de verdad.

## Fuera de alcance

- Ejecutar los comandos que cita AGENTS.md.
- Medir el tamaño de AGENTS.md.
- Revisar la configuración de CI.
- Los AGENTS.md anidados.

## Supuestos

- A1: Una ruta citada es un tramo de código en línea de AGENTS.md con al menos dos partes separadas por `/` (`docs/formats.md`, `packages/core/src/`). No cuentan los que tienen espacios (comandos), comodines o marcadores (`*`, `<id>`), los paquetes (`@scope/nombre`), las direcciones con `:` ni las rutas que salen de la raíz; un fragmento como `theme/` es relativo al texto que lo rodea.
- A2: Una ruta que git ignora (por ejemplo, la de un build) no se avisa aunque falte: se genera.
- A3: Que falte una ruta es un aviso, no un problema: AGENTS.md es de la persona. Una versión de Node anterior a la 22 sí es un problema, porque Specty no corre en ella.

## Criterios de aceptación

- AC1: CUANDO AGENTS.md cita como código una ruta que no existe y git no ignora ENTONCES `doctor` lo dice en AVISOS, con esa ruta, y termina con código 0.
- AC2: CUANDO las rutas citadas existen, o son fragmentos, comandos, globs, paquetes o rutas que git ignora, ENTONCES `doctor` no avisa de ellas.
- AC3: CUANDO Node es anterior a la 22 ENTONCES `doctor` da un problema que lo dice; si no, en OK dice la versión.
- AC4: CUANDO alguien lee ARCHITECTURE §14 ENTONCES su lista dice lo que comprueba `doctor`, sin lo que no hace.

## Archivos

- modificar packages/core/src/agents-md.ts — `citedPaths`
- modificar packages/core/src/index.ts — exportarla
- modificar packages/core/test/agents-md.test.ts — qué es una ruta citada
- modificar packages/cli/src/commands/doctor.ts — el aviso de las rutas y la versión de Node
- modificar packages/cli/test/setup.test.ts — doctor avisa de una ruta que falta y de ninguna otra
- modificar docs/ARCHITECTURE.md — §14

## Tareas

- [x] T1: Las rutas que cita AGENTS.md
  - files: packages/core/src/agents-md.ts, packages/core/src/index.ts, packages/core/test/agents-md.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/agents-md.test.ts
- [x] T2: doctor avisa de las rutas que faltan y comprueba Node
  - files: packages/cli/src/commands/doctor.ts, packages/cli/test/setup.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3, AC4
  - verify: pnpm check

## Cierre

### Resumen

`specty doctor` comprueba ahora lo que ARCHITECTURE §14 promete. Avisa de las rutas que AGENTS.md cita como código y ya no existen (`citedPaths` en core: las de dos tramos o más, sin fragmentos, comandos, globs, marcadores, paquetes ni direcciones), salvo las que git ignora, como las de un build. Y da un problema si Node es anterior a la 22, la versión de `engines`. Sobre el AGENTS.md de este repositorio, que cita muchas rutas, no da ningún aviso falso. La lista de §14 dice ahora lo que `doctor` hace, y lo que no: no ejecuta los comandos citados, no mide AGENTS.md ni revisa la CI.

### Desviaciones

- Ninguna.

### Decisiones

- Una ruta que falta es un aviso, no un problema: AGENTS.md es de la persona. Node antiguo sí es un problema, porque Specty no corre en él.
- La lista de §14 se reescribió entera para que cada línea sea una comprobación que existe, también las que ya había (configuración, formateadores, modo delegado).

### Pendientes

- Ninguno.
