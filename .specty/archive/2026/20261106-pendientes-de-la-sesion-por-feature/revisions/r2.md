---
kind: epic
---

# Los pendientes son solo del trabajo de la sesión y se ordenan por feature

## Objetivo

Hoy cada sesión empieza con «Pendientes y mejoras abiertas: 72. Las primeras libres: …», y los agentes repiten en sus reportes pendientes ajenos, ya hechos o propuestos para descartar. Además, un pendiente que se resuelve sin `--resolves` sigue abierto, y el mismo problema entra varias veces con otras palabras (P78/P79, P98/P99/P100/P108). Con esta épica:

- el agente solo ve y reporta los pendientes de su propio trabajo;
- un pendiente ajeno solo se menciona si el trabajo actual lo resolvió, y entonces sale de la lista;
- un pendiente parecido a uno abierto no entra dos veces;
- la UI agrupa los pendientes bajo la feature de donde salieron;
- las respuestas de los agentes son directas y concisas.

## Fuera de alcance

- Limpiar las entradas abiertas de hoy: descartar es solo de la persona (ADR 0016). Se ofrece aparte una lista de candidatas.
- Cambiar quién descarta una entrada o que un agente pueda descartar.
- Agrupar por feature las decisiones, las lecciones y los recordatorios.
- Comparar por parecido los pendientes que el cierre cosecha: sigue comparando el texto exacto.
- La memoria propia de cada agente (como la de Claude Code), que no es de Specty.
- Medir con un hook lo larga que es una respuesta: la brevedad es una regla de AGENTS.md.

## Supuestos

- A1: Un pendiente ajeno es una entrada abierta que no salió del cambio de la sesión ni fue tomada por él. La tarjeta de inicio de sesión y `next` sin cambio dejan de listar las entradas libres, de contarlas y de remitir a `specty memory`. Conservan los recordatorios, que alguien programó para que salgan en las sesiones, y la lista del frente de la sesión cuando la persona le asignó uno, porque ese es su trabajo.
  - impacto: alto
- A2: `specty memory resolve <ids...>` solo funciona dentro de un cambio abierto y toma las entradas para ese cambio, como `new --resolves` y con sus mismas negativas. Las entradas quedan hechas al cerrarse el cambio y libres otra vez si se cancela. Hecha no es borrada: sale de las listas de abiertas y la rama de la memoria guarda su historia.
  - impacto: alto
- A3: Un pendiente se parece a otro con la regla que ya usa `new` para los cambios (`similarTexts` de `flow/duplicates.ts`): comparten la mitad de las palabras significativas del texto más corto, y al menos dos. Medida sobre las 80 entradas abiertas de este repositorio, encuentra P78/P79, P98/P99/P100/P108 y P2/P9, y no encuentra P67/P171 ni P176/P179.
  - impacto: alto
- A4: El `memory add` de un agente no escribe un pendiente ni una mejora que se parezca a uno abierto. Responde con los parecidos y pide repetir con `--distinct-from <ids>` si es distinto, y la respuesta le dice que no los mencione al usuario. El de la persona, desde su terminal o la UI, no tiene este freno, y las lecciones y los recordatorios tampoco.
  - impacto: alto
- A5: Un punto de «Pendientes» del cierre que dice que no hay ninguno no se cosecha: «Ninguno», «Ninguno nuevo», «No hay», «Nada pendiente», «None», «Nothing new» y variantes con punto o con explicación tras «.» o «:». Hoy solo se ignoran «Ninguno», «Ninguna» y «None» exactos (P74, P173).
- A6: La regla de brevedad va en el bloque de reglas que `init` escribe en AGENTS.md: primero el resultado o la pregunta, sin repetir la salida de Specty, sin narrar cada paso y sin enumerar opciones que no se van a seguir. El AGENTS.md de este repositorio la recibe cuando la persona ejecuta `specty init`.
  - impacto: medio
- A7: La feature de un pendiente es el cambio de su `origin.change`, y si ese cambio es un corte, va bajo su épica. `GET /api/memory` añade el título, la fase y la épica (id y título) de cada cambio de origen, abierto o archivado; uno que no encuentra sale con su id como título. Las entradas sin cambio de origen van al final, en «Sin feature».
  - impacto: alto
- A8: En la página Memoria, la sección «Pendientes y mejoras» va por grupos, como la Bandeja: cada épica es una cabecera con sus features dentro, y cada feature es una cabecera con su título, su insignia («Feature» o «Feature · C2»), su fase y el enlace a su página, con sus entradas sangradas debajo. Los grupos se ordenan por la fecha de su entrada más reciente, la más reciente primero, y las entradas de un grupo, por fecha. La búsqueda también mira el título de la feature.
- A9: La página de un cambio lista las entradas que salieron de él y las que tomó (con `--resolves` o `memory resolve`), cada una con su estado. Su id lleva a la Memoria con esa entrada buscada.

## Criterios de aceptación

- AC1: CUANDO un agente empieza una sesión o ejecuta `next` sin un cambio activo y la memoria tiene pendientes o mejoras abiertas ENTONCES la tarjeta no los lista, no dice cuántos hay ni remite a `specty memory`; sigue mostrando los recordatorios que tocan y, si la sesión tiene un frente, sus primeras entradas libres.
- AC2: CUANDO `init` escribe el bloque de reglas de AGENTS.md ENTONCES pide responder al usuario de forma directa y concisa, y que el reporte final solo nombre los pendientes del trabajo de la sesión y, de los demás, solo los que ese trabajo resolvió.
- AC3: CUANDO el cierre de un cambio tiene en «Pendientes» un punto que dice que no hay ninguno («Ninguno nuevo.», «No hay.», «None.») ENTONCES no se guarda como pendiente.
- AC4: CUANDO un agente ejecuta `memory resolve P12` dentro de un cambio abierto ENTONCES P12 queda tomada por ese cambio; al cerrarse el cambio queda hecha y la salida del cierre dice que la resolvió; si se cancela, queda libre otra vez.
- AC5: CUANDO `memory resolve` nombra una entrada que no existe, ya hecha o descartada, un recordatorio, una decisión o una entrada que tomó otro cambio abierto, o se ejecuta sin un cambio activo ENTONCES no toma nada y dice por qué.
- AC6: CUANDO un agente añade con `memory add` un pendiente o una mejora parecidos a uno abierto ENTONCES no se escribe, y la salida muestra los parecidos y cómo añadirlo con `--distinct-from` si es distinto; CUANDO lo repite con `--distinct-from` y esos ids ENTONCES se escribe.
- AC7: CUANDO la persona abre la página Memoria ENTONCES los pendientes y las mejoras abiertos van agrupados bajo la feature de donde salieron, con su título, su fase y un enlace a su página, y bajo su épica cuando la feature es un corte; los que no salieron de un cambio van en «Sin feature», al final.
- AC8: CUANDO la persona busca en la página Memoria el título de una feature ENTONCES ve los pendientes de esa feature.
- AC9: CUANDO la persona abre la página de un cambio que dejó pendientes o tomó entradas ENTONCES la página los lista con su estado, y cada id lleva a la Memoria con esa entrada.
- AC10: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- Core, tarjetas: `cards/memory.ts` (`memoryStartBlocks` sin `workLines` salvo el frente propio; las tarjetas de `memory resolve` y del freno de parecidos); `agents-md.ts` (las reglas de A6 y del reporte final); `cards/archived-memory.ts` (lo que resolvió el cierre).
- Core, memoria: `memory/entries.ts` (`harvestable` reconoce los «no hay ninguno» de A5; una función que da las entradas abiertas parecidas a un texto, con `similarTexts` de `flow/duplicates.ts`).
- CLI: un archivo nuevo `commands/memory-resolve.ts`, como `memory-drop.ts`, porque `commands/memory.ts` ya tiene 324 líneas; reusa `claimable` y `takenEntry`, y el cierre ya marca hechas las tomadas (`settleEntries`). El freno de A4 va en `memory add`, con `--distinct-from`.
- Servidor: `server/api.ts` (`memoryView` añade `origins` con título, fase y épica de cada cambio de origen, de los registros abiertos y archivados que ya lee el servidor).
- UI: `memory/memory-view.ts` (los grupos por épica y feature, y la búsqueda por título); un componente para la cabecera de un grupo, para que `memory/memory-page.ts` (284 líneas) no crezca; `change/` (las entradas de un cambio).
- Docs: `docs/formats.md` (sin campos nuevos en las entradas; `memory resolve` y `--distinct-from`), ADR 0016 (quién ve qué pendientes) y `docs/ui.md` (Memoria y página de un cambio).

## Cortes

- C1: El agente solo ve y reporta los pendientes de su trabajo
  - ac: AC1, AC2, AC3, AC10
- C2: Un pendiente ajeno que resuelve el trabajo sale de la lista
  - ac: AC4, AC5, AC10
  - depends: C1
- C3: Un pendiente parecido a uno abierto no entra dos veces
  - ac: AC6, AC10
  - depends: C2
- C4: La Memoria agrupa los pendientes por su feature
  - ac: AC7, AC8, AC10
- C5: La página de un cambio muestra sus pendientes
  - ac: AC9, AC10
  - depends: C4

## Riesgos

- R1: Al no ver los pendientes abiertos, un agente puede volver a anotar uno que ya existe. Mitigación: el freno de parecidos de C3.
- R2: El freno de parecidos da falsos positivos (P2/P9 son distintos y se parecen). Mitigación: `--distinct-from` lo resuelve en un paso, y la persona no tiene freno.
- R3: Leer el título de cada cambio de origen hace más lento `GET /api/memory`. Mitigación: el servidor ya guarda en memoria los archivados que leyó.

## Cierre

### Resumen

Cinco cortes, todos cerrados:
- C1: la tarjeta de inicio de sesión y `next` sin cambio ya no listan ni cuentan los pendientes ajenos (solo el frente propio y los recordatorios); la regla de AGENTS.md pide respuestas directas y concisas y un reporte final con solo los pendientes propios; el cierre ya no guarda viñetas como «Ninguno nuevo.» (resuelve P74).
- C2: `specty memory resolve <ids>` toma para el cambio abierto de la carpeta un pendiente ajeno que su trabajo resolvió; queda hecho al cerrarse el cambio, y la salida del cierre lo nombra.
- C3: el `memory add` de un agente no escribe un pendiente o una mejora parecidos a uno abierto sin `--distinct-from`.
- C4: la página Memoria agrupa los pendientes bajo su épica y su feature, con «Sin feature» al final; `GET /api/memory` da `origins`.
- C5: la página de un cambio lista, en «En la memoria», las entradas que salieron de él o que tomó, con enlace a la Memoria.

Las dos pantallas se comprobaron en el navegador con `specty ui` después de cerrar C5.

### Desviaciones

- El clasificador de Claude Code bloqueó la autoaprobación en modo delegado; desde que la persona lo autorizó en el chat («aprueba, acepta y cierra tú»), el agente principal ejecutó approve, accept y close, y cada subagente paraba antes.
- C1 necesitó un ajuste (revisión 2) por un test fuera de su alcance (`setup.test.ts`); C4 falló una aceptación por una exportación sin uso (knip); C1 y C3 tuvieron fallos de verificación por la carga de la máquina, no por tests en rojo.
- El subagente de C3 se cortó por un error de red y el agente principal escribió su cierre.
- El cierre de C1 se cosechó con el CLI de main anterior a C1 y guardó «Ninguno nuevo.» como P192; se propuso descartarla.

### Decisiones

- Los recordatorios y el frente propio siguen en la tarjeta de inicio: son trabajo programado o asignado a la sesión.
- Un pendiente resuelto se marca hecho al cerrar el cambio, no se borra, para que quede su historia.
- El freno de parecidos reusa `similarTexts` de `new` y solo aplica a los agentes.

### Pendientes

- P194, ya en la memoria: el guard no frena `memory resolve` sobre una entrada del frente de otra conversación.
- `specty ui` sirve la UI de `packages/ui/dist`, que el `git.afterLanding` de este repositorio no reconstruye: tras cerrar C4 y C5, la UI servida seguía siendo la del día anterior hasta ejecutar `pnpm --filter @baquia-dev/specty-ui build`. La persona puede añadir ese build a `afterLanding` en `.specty/config.yaml`.
