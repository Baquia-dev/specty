---
kind: standard
---

# doctor avisa del Mapa y las Convenciones sin completar

## Objetivo

`init` crea AGENTS.md con las secciones «Mapa» y «Convenciones», cada una con una pista, y su SIGUIENTE pide completarlas y ejecutar `specty doctor`. Pero `doctor` no lo comprueba, y si nadie las completa, el agente lee en cada sesión dos secciones vacías. Ahora `doctor` avisa de las que siguen sin completar y recuerda qué va en ellas.

## Fuera de alcance

- Avisar si AGENTS.md no tiene esas secciones.
- Juzgar si lo que escribió la persona es bueno o suficiente.
- Los AGENTS.md anidados.

## Supuestos

- A1: Una sección está sin completar si, hasta el siguiente encabezado de su nivel o de uno superior, solo tiene comentarios HTML (como la pista) y espacios. Un subapartado con contenido cuenta como completarla.
- A2: Se reconocen los títulos en español y en inglés («Mapa», «Map», «Convenciones», «Conventions»), sin distinguir mayúsculas ni tildes, en cualquier nivel de encabezado y sea cual sea el idioma de la configuración. Si AGENTS.md no los tiene, no se avisa: el resto del archivo es de la persona, y `init` solo añade esas secciones a un AGENTS.md nuevo.
- A3: Es un aviso, no un problema: `doctor` sigue en verde, como con el modo delegado, porque nada falla por tenerlas vacías.

## Criterios de aceptación

- AC1: CUANDO AGENTS.md tiene «Mapa» o «Convenciones» sin más que la pista ENTONCES `specty doctor` lo dice en AVISOS, con el título de cada sección vacía tal como está en el archivo y qué va en ellas, y termina con código 0.
- AC2: CUANDO esas secciones tienen contenido, o AGENTS.md no las tiene, ENTONCES `specty doctor` no avisa de ellas.
- AC3: CUANDO alguien lee ARCHITECTURE ENTONCES encuentra este aviso en §7 y entre lo que comprueba `specty doctor`.

## Diseño

- Core, `agents-md.ts`: `unfilledSections(text)` devuelve, en orden, los títulos de las secciones de la persona sin completar, tal como están escritos. Es pura y se exporta junto a `humanSections`.
- CLI, `doctor.ts`: si AGENTS.md existe, añade un aviso con esas secciones, antes del aviso del modo delegado.

## Archivos

- modificar packages/core/src/agents-md.ts — `unfilledSections`
- modificar packages/core/src/index.ts — exportarla
- crear packages/core/test/agents-md.test.ts — qué cuenta como sin completar
- modificar packages/cli/src/commands/doctor.ts — el aviso
- modificar packages/cli/test/setup.test.ts — `doctor` avisa tras `init` y deja de avisar al completarlas
- modificar docs/ARCHITECTURE.md — §7 y lo que comprueba `doctor`

## Tareas

- [x] T1: El core reconoce el Mapa y las Convenciones sin completar
  - files: packages/core/src/agents-md.ts, packages/core/src/index.ts, packages/core/test/agents-md.test.ts
  - ac: AC1, AC2
  - verify: pnpm --filter @baquia-dev/specty-core exec vitest run test/agents-md.test.ts
- [x] T2: doctor avisa de las secciones sin completar
  - files: packages/cli/src/commands/doctor.ts, packages/cli/test/setup.test.ts, docs/ARCHITECTURE.md
  - ac: AC1, AC2, AC3
  - verify: pnpm check

## Cierre

### Resumen

`unfilledSections`, en el core, reconoce «Mapa» y «Convenciones» (o «Map» y «Conventions») que, hasta el siguiente encabezado de su nivel o de uno superior, solo tienen comentarios y espacios. `specty doctor` lo dice en AVISOS, con los títulos tal como están y qué va en esas secciones, y sigue en verde. Tras `init`, el aviso sale hasta que la persona las completa; si AGENTS.md no tiene esas secciones, no avisa. ARCHITECTURE lo cuenta en §7 y en lo que comprueba `doctor` (§14).

### Desviaciones

- `packages/cli/test/install.test.ts`, que no estaba en la lista de archivos pero entraba en el alcance como test: el test del modo delegado esperaba cero avisos justo tras `init`, y ahora sale el de las secciones. Al fallar, se paró y el usuario decidió precisar la aserción: comprueba que no salga «Modo delegado», que era su propósito.

### Decisiones

- Los títulos salen de `humanSections`, en todos los idiomas, en vez de repetirse: si cambia el título que escribe `init`, el aviso lo sigue.
- Cualquier cosa que no sea un comentario cuenta como contenido, también un encabezado; no se juzga qué escribió la persona.
- Solo se reconocen los encabezados con `#`. Los subrayados con `===` no cuentan, y un `## Mapa` dentro de un bloque de código se toma como encabezado: en un AGENTS.md es raro y solo cambia un aviso.

### Pendientes

- Ninguno.
