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
