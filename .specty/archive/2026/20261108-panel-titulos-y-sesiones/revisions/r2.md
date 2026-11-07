---
kind: epic
---

# Las listas del panel muestran el título y «Sesiones» muestra «—» sin dato

## Objetivo

En el «Panel» de `specty ui`, «Los cambios más caros» y «Cambios con más verificaciones fallidas» muestran hoy el id de cada cambio, porque `GET /api/stats` no lee las specs (P349). Con esta épica muestran su título, como la tabla «Cambios». Además, «Sesiones» muestra hoy 0 para los agentes cuya herramienta no informa su sesión (todos menos Claude Code) y para «(sin dato)», como si hubieran trabajado sin ninguna. Pasará a mostrar «—», como las demás cifras que nada mide (P329). Como un solo cambio salía demasiado grande (toca core, cli y ui), va en cortes. Un tercer corte hace la limpieza del core que pidió el usuario y que toca los mismos archivos (P328): `people.ts` (`rowOf`) repite cómo `summary.ts` (`countsOf`) cuenta el ciclo, las verificaciones y el coste de un periodo, y su orden por cambios repite el de `optionsOf`.

## Fuera de alcance

- «LOS CAMBIOS MÁS CAROS» de `specty stats` en la terminal sigue con el id: es una tabla estrecha, el id ya enlaza con los demás comandos y así `specty stats` no tiene que leer cada spec.
- Las sesiones por cambio de «Flujo y esperas»: ya cuentan solo los cambios que informan alguna.
- El resto de la limpieza del panel (P323, P327, P342, P344 y P345): va en otros dos cambios, en la UI.

## Supuestos

- A1: `GET /api/stats` lee las filas con su título, como ya hace `GET /api/stats/changes` (`listedRows` de `server/stats-changes.ts`, que guarda la fila de cada registro mientras este dura). `StatsRow` gana un `title` opcional, que `statsRow` no rellena, y el core lo copia en cada cambio de `cost.top` y `quality.worst` cuando la fila lo trae. `specty stats` sigue con `statsRow`, sin títulos.
  - impacto: alto
- A2: Cada cambio de las dos listas muestra su título enlazado a su cambio y, debajo, su id en letra monoespaciada pequeña y atenuada, como la tabla «Cambios». Sin título (una fuente que no lo da), muestra el id como hoy.
  - impacto: medio
- A3: «Sesiones» de «Personas y agentes» es `null` cuando ninguna línea de ninguno de sus cambios trae `session`, en cualquier día. Si alguna la trae pero ninguna en el periodo, sigue siendo 0: esa cifra sí se mide.
  - impacto: medio
- A4: «Sesiones» de «Los cambios más caros», que cuenta las de todo el cambio, también es `null` cuando ninguna línea del cambio trae `session`, por coherencia con A3.
- A5: `specty stats` muestra «—» en sus columnas «Sesiones» cuando el valor es `null`.
- A6: La limpieza de P328 no cambia ninguna cifra: `people.ts` y `summary.ts` comparten el conteo del periodo y el orden por cambios desde un mismo módulo del core, y los tests que ya tienen siguen pasando sin cambios.

## Criterios de aceptación

- AC1: CUANDO la persona mira «Los cambios más caros» en el panel ENTONCES cada cambio muestra su título, enlazado a su cambio, con su id debajo.
- AC2: CUANDO mira «Cambios con más verificaciones fallidas» ENTONCES cada cambio muestra su título, enlazado a su cambio, con su id debajo.
- AC3: CUANDO ninguna línea de los cambios de una persona, un agente o un modelo trae su sesión ENTONCES «Sesiones» de «Personas y agentes» muestra «—», en el panel y en `specty stats`; con alguna, el número de sesiones del periodo, también 0.
- AC4: CUANDO ninguna línea de uno de «Los cambios más caros» trae su sesión ENTONCES su «Sesiones» muestra «—», en el panel y en `specty stats`.
- AC5: CUANDO el core calcula el panel con filas que traen título ENTONCES cada cambio de `cost.top` y de `quality.worst` lleva su título, y sin él solo su id.
- AC6: CUANDO la UI pide `GET /api/stats` ENTONCES cada cambio de `cost.top` y `quality.worst` trae el título de su spec.
- AC7: CUANDO el core calcula «Personas y agentes» y el resumen del periodo ENTONCES cuenta el ciclo, las verificaciones y el coste con el mismo código, y ordena por cambios con el mismo criterio, sin que cambie ninguna cifra.

## Cortes

- C1: «Sesiones» muestra «—» cuando nada la mide
  - ac: AC3, AC4
- C2: Las listas del panel muestran el título de cada cambio
  - ac: AC1, AC2, AC5, AC6
- C3: Personas y el resumen del panel cuentan el periodo con el mismo código
  - ac: AC7
  - depends: C1

## Cierre

### Resumen

Las listas del «Panel» muestran el título de cada cambio y «Sesiones» muestra «—» cuando nada la mide, en tres cortes cerrados en main. C1 (46518cf, P329): el core da `null` en «Sesiones» de «Personas y agentes» y de «Los cambios más caros» cuando ninguna línea de sus cambios trae sesión, y el panel y `specty stats` escriben «—»; con alguna sesión pero ninguna en el periodo sigue siendo 0. C2 (6455915, P349): `StatsRow` gana un `title` opcional, `cost.top` y `quality.worst` lo copian, el servidor lee las filas con `listedRows` y las dos listas muestran el título enlazado con el id debajo, como la tabla «Cambios». C3 (df8af8c, P328): `stats/counts.ts` reúne el conteo del periodo y el orden por cambios que repetían `people.ts` y `summary.ts`, sin cambiar ninguna cifra.

### Desviaciones

- La épica nació de un cambio estándar que salió XL (`20261107-las-listas-del-panel-muestran-el-titulo-y`). Al ponerle `kind: epic` en su sitio, Specty lo aprobó como estándar vacío, porque ningún comando cambia el tipo del estado (P354). Con el permiso del usuario se canceló y se rehízo como esta épica, que añadió C3 para la limpieza P328.
- `specty stats` también lee las filas con título (C2), en contra de A1: un test aprobado exige que `specty stats --json` dé lo mismo que `GET /api/stats`. La tabla de la terminal sigue con el id y el tiempo medido no cambia.
- C1 necesitó dos desbloqueos del test de AC1 del core, aprobados por la persona: uno de datos (S1) y otro solo de formato (S2), porque el parche de S1 no pasaba por Biome.
- C1 y C3 los terminó otra sesión del usuario, en paralelo con los subagentes de esta.

### Decisiones

- Tres cortes independientes salvo C3, que esperó a C1 porque los dos tocan `people.ts`; C1 y C2 limitaron sus cambios en `cost.ts` y `dashboard-cost.ts` a su parte, y el conflicto de `docs/ui.md` se resolvió al incorporar main conservando las dos.

### Pendientes

- Ninguno.
