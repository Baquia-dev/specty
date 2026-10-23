---
kind: standard
follows:
  - 20261022-pestana-aceptacion-criterios-con-evidencia-y-mat
---

# Verificación completa en la pestaña Aceptación

## Objetivo

Antes de aceptar, la persona puede ejecutar la verificación completa del proyecto (`verify.full`) desde la pestaña Aceptación y ver su salida en vivo, como la de una tarea en Progreso. El resultado queda registrado y a la vista: la verificación de cada tarea no basta para saber que el resto del proyecto sigue en pie.

## Fuera de alcance

- El aviso bajo «Aceptar resultado» y el diálogo de aceptar según el resultado («Ejecutarla antes», «Aceptar de todos modos»): van en un cambio rápido después de este.
- Que `specty accept` registre `change.verified` cuando ejecuta la verificación completa, y que el servidor local la ejecute y transmita: el prototipo la simula en su fuente de datos.
- Los diffs y el cierre.

## Supuestos

- A1: En la pestaña Aceptación, encima de «Criterios», va la sección «Verificación completa» con el comando a la derecha del divisor. Sin resultados dice «Sin ejecutar» y «Corre todos los tests del proyecto, no solo los de cada tarea.». Con un resultado muestra «Correcta · 14 s · hace 2 min» o «Falló · 9 s · hace 2 min», con «Ver salida» para sus últimas líneas, abiertas cuando falló. El botón dice «Ejecutar» o, tras un resultado, «Ejecutar de nuevo».
  - impacto: alto
- A2: Mientras corre, la sección muestra el mismo bloque en vivo de Progreso: «Verificando · 0:42», el comando, las líneas con sus colores, «Ir al final» y ocultar o mostrar. Llega por el mismo canal, `watchRun`: una ejecución sin tarea es la verificación completa. El lector de pantalla oye «Verificando todo el cambio» y cómo terminó.
  - impacto: alto
- A3: El resultado se registra en `audit.jsonl` como `change.verified`, con el comando, el código de salida, la duración y, si falló, el final de la salida, igual que `task.verified`. La sección muestra el último. El formato se documenta en `docs/formats.md`.
  - impacto: alto
- A4: La sección solo aparece si el proyecto tiene `verify.full` en `config.yaml`; la fuente lo entrega con cada cambio (`ChangeRecord.verifyFull`). Se puede ejecutar solo en aceptación; en otras fases muestra el último resultado, si lo hay, sin el botón.
- A5: Hay una verificación a la vez por cambio: si ya corre otra (la de una tarea o la completa), «Ejecutar» no empieza otra y un aviso lo explica. La fuente gana la acción `verifyChange(change)`, de solo lectura por defecto.
- A6: La fuente de ejemplo usa `flutter analyze && flutter test` como `verify.full` e imprime un análisis y los tests línea a línea. El comando de la paleta «Simular: alternar el resultado de la verificación completa» hace que la siguiente falle o pase, para ver los dos casos.
- A7: Para no pasar de 300 líneas, `relativeTime` sale de `records.ts` a `data/time.ts` y las muestras salen de `fixtures.ts` a `data/sample-records.ts`; los dos archivos las reexportan, así que nadie más cambia sus imports.

## Criterios de aceptación

- AC1: CUANDO el proyecto tiene `verify.full` y la persona abre la pestaña Aceptación ENTONCES ve «Verificación completa» con su comando y su último resultado o «Sin ejecutar», y en aceptación el botón para ejecutarla.
- AC2: CUANDO pulsa «Ejecutar» ENTONCES ve la salida en vivo con el reloj, el comando y las líneas con sus colores, en un panel de altura fija que se desplaza por dentro cuando las líneas no caben, puede ocultarla o volver al final, y el lector de pantalla anuncia que empezó y cómo terminó.
- AC3: CUANDO la verificación termina ENTONCES queda su resultado, correcto o fallido, con las últimas líneas si falló, y sigue ahí al volver a la página.
- AC4: CUANDO ya corre una verificación en el cambio, o la fuente no puede ejecutarla, ENTONCES un aviso lo explica y no empieza otra.
- AC5: CUANDO el proyecto no tiene `verify.full` ENTONCES la sección no aparece.

## Diseño

- **Formato** (`docs/formats.md`): el evento `change.verified` en la tabla de §4, con un ejemplo.
- **Contrato** (`data/records.ts`, `data/progress.ts`): `ChangeRecord.verifyFull` y `SpectyData.verifyChange(change)`. `RunRecord.task` pasa a ser opcional (sin tarea es la completa). `ProgressView.full` lleva el comando y el último `change.verified`, leído con las mismas guardas que `task.verified`.
- **Vistas** (`data/views.ts`): `progressOf` recibe `verify.full` del registro.
- **Simulación** (`data/sample-run.ts`, `data/sample-records.ts`, `data/fixtures.ts`): el guion de la verificación completa, que termina bien o mal según el interruptor de la paleta, y `verifiedIn` deja `change.verified` cuando la ejecución no tiene tarea. `verifyChange` rechaza con un aviso si el cambio ya verifica algo o no está en aceptación.
- **Bloque en vivo** (`progress/live-output.ts`): sin tarea, sus anuncios hablan de «todo el cambio».
- **Sección** (`acceptance/full-verification.ts`): `sp-full-verification`, que se suscribe a `watchRun` del cambio y muestra el último resultado, el bloque en vivo o «Sin ejecutar»; la pestaña la pone encima de «Criterios».

## Archivos

- modificar docs/formats.md — el evento change.verified
- crear packages/ui/src/data/time.ts — relativeTime, fuera de records.ts
- modificar packages/ui/src/data/records.ts — verifyFull y la acción verifyChange
- modificar packages/ui/src/data/progress.ts — la ejecución sin tarea y el último change.verified
- modificar packages/ui/src/data/progress.test.ts — tests de la verificación completa en el progreso
- modificar packages/ui/src/data/views.ts — verify.full en la vista
- crear packages/ui/src/data/sample-records.ts — las muestras, fuera de fixtures.ts, con verify.full
- modificar packages/ui/src/data/fixtures.ts — verifyChange y el interruptor de la paleta
- modificar packages/ui/src/data/sample-run.ts — la verificación completa simulada
- modificar packages/ui/src/data/sample-run.test.ts — tests de la simulación
- modificar packages/ui/src/progress/live-output.ts — los anuncios de la verificación completa
- crear packages/ui/src/acceptance/full-verification.ts — la sección «Verificación completa»
- crear packages/ui/src/acceptance/full-verification.test.ts — tests de la sección
- modificar packages/ui/src/acceptance/acceptance-tab.ts — la sección encima de los criterios
- modificar docs/ui.md — la verificación completa en Aceptación

## Tareas

- [x] T1: El registro de la verificación completa
  - files: docs/formats.md, packages/ui/src/data/time.ts, packages/ui/src/data/records.ts, packages/ui/src/data/progress.ts, packages/ui/src/data/progress.test.ts
  - ac: AC1, AC3, AC5
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/progress.test.ts
- [x] T2: La verificación completa simulada
  - files: packages/ui/src/data/views.ts, packages/ui/src/data/sample-records.ts, packages/ui/src/data/fixtures.ts, packages/ui/src/data/sample-run.ts, packages/ui/src/data/sample-run.test.ts
  - ac: AC2, AC3, AC4
  - verify: pnpm --filter @baquia-dev/specty-ui exec ng test --no-watch --include src/data/sample-run.test.ts
- [x] T3: La sección en la pestaña Aceptación
  - files: packages/ui/src/progress/live-output.ts, packages/ui/src/acceptance/full-verification.ts, packages/ui/src/acceptance/full-verification.test.ts, packages/ui/src/acceptance/acceptance-tab.ts, docs/ui.md
  - ac: AC1, AC2, AC3, AC4, AC5
  - verify: pnpm check
  - notes: Comprobar en el navegador, a 390 y 1280 px, en claro y oscuro: ejecutar la verificación completa de «Panel de asistencia por curso», ver llegar las líneas, ocultar y mostrar, el resultado al terminar y tras recargar, y el caso fallido con el interruptor de la paleta.
- [x] T4: El panel en vivo con altura fija
  - files: packages/ui/src/progress/live-output.ts, docs/ui.md
  - ac: AC2
  - verify: pnpm check
  - notes: Ajuste pedido al revisar el resultado. El panel de la salida en vivo tiene una altura fija desde la primera línea, en vez de crecer hasta su máximo, y se desplaza por dentro cuando no caben; es el mismo bloque en Progreso. Comprobar en el navegador a 390 y 1280 px que no cambia de alto mientras llegan las líneas.

## Riesgos

- R1: Son 15 archivos, el máximo — dos solo se tocan para hacer sitio (`time.ts` y `sample-records.ts`); si aparece otro, se pide con `specty scope add`.
- R2: El formato gana un evento que la CLI aún no escribe — queda en Fuera de alcance y en los pendientes del cierre, para que `specty accept` lo registre en su cambio.

## Cierre

### Resumen

La pestaña Aceptación tiene la sección «Verificación completa», encima de los criterios, cuando el proyecto define `verify.full`. Muestra el comando y «Sin ejecutar» o el último resultado («Correcta · 3 s · este minuto» o «Falló · …» con sus últimas líneas). En aceptación, «Ejecutar» la pide a la fuente, y mientras corre se ve el mismo bloque en vivo de Progreso, en un panel de altura fija que se desplaza por dentro. El resultado queda en `audit.jsonl` como `change.verified`, documentado en `docs/formats.md`, así que sigue a la vista al volver. Hay una verificación a la vez por cambio. En el prototipo, la paleta puede hacer que la siguiente falle para ver los dos casos.

### Desviaciones

- **El commit de T1 no compila solo:** `RunRecord.task` pasó a ser opcional y rompió `sample-run.ts`, que era de T2; T2 lo arregló en el commit siguiente.
- **Arreglo en el navegador (T3):** en el móvil, el comando largo partía el título del divisor; ahí va debajo, junto al estado. El test de la pestaña busca ahora el divisor de «Criterios», porque el primero es el de la verificación completa.
- **Ajuste al revisar (T4):** el panel en vivo tiene altura fija desde la primera línea y se desplaza por dentro, sin arrastrar la página (AC2 refinado). Es el mismo bloque en Progreso.
- **Ajuste retirado:** la animación al aparecer el panel no cupo. Con una quinta tarea, el cambio pasaba a tamaño XL, así que se retiró sin tocar la spec (la revisión 3 es igual a la 2) y va en un cambio rápido después de este.
- **Fallo de Specty:** al aprobar la revisión 3, con todas las tareas ya hechas, la fase quedó en `implementing`. `specty accept` no podía aceptar y ninguna tarea podía avanzarla, así que la persona cambió a mano la fase de `state.json` a `acceptance` antes de aceptar.

### Decisiones

- **Mismo canal en vivo:** la verificación completa usa `watchRun`; una ejecución sin tarea es la completa, así que Progreso la ignora y la sección de Aceptación solo muestra esas.
- **`change.verified` como `task.verified`:** mismos datos y mismas guardas al leerlo, con una función común (`runOf`).
- **`verify.full` en cada registro:** la configuración es del proyecto, pero la fuente la añade a cada cambio (`ChangeRecord.verifyFull`) en lugar de abrir otra API de configuración.
- **Sitio sin tocar imports:** `relativeTime` pasó a `data/time.ts` y las muestras a `data/sample-records.ts`; los archivos de origen los reexportan.
- **Desplazamiento contenido:** el panel en vivo usa `overscroll-contain`, para que al llegar a sus extremos no se mueva la página.

### Pendientes

- **Animación de la salida en vivo:** el panel se abre con altura y opacidad, y la línea del reloj entra con un desvanecido; sin animación si se reduce el movimiento. Cambio rápido siguiente.
- **Decidir con la verificación completa:** el aviso bajo «Aceptar resultado» y el diálogo de aceptar con «Ejecutarla antes» o «Aceptar de todos modos». Cambio rápido.
- **Specty:** que aprobar una revisión sin tareas pendientes lleve a aceptación (y que `doctor` avise del desajuste); que `specty accept` registre `change.verified`; y que el servidor local ejecute `verify.full` y transmita su salida.
- **Del cambio anterior:** la franja dice «cierre por confirmar» antes de que el agente envíe el cierre.
