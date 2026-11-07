---
kind: epic
---

# Un panel muestra lo que se hizo con Specty, en total o por persona, agente y modelo

## Objetivo

Specty guarda en el estado y la auditoría de cada cambio, y en su memoria, todo lo que pasó: tareas, verificaciones, esperas, aprobaciones, alcance, integraciones y coste. Hoy solo se ve cambio a cambio. Con este cambio, una página «Panel» en `specty ui` lo resume en gráficas y tablas para un periodo, en total o por persona, agente o modelo, comparado con el periodo anterior. `specty stats` da el mismo resumen en la terminal, y el panel exporta sus filas a CSV o JSON. La distribución y el contenido son los que la persona eligió el 2026-11-07 en una maqueta con los datos de este repositorio: «A · Informe en una página», con las ocho secciones, 30 días por defecto y comparación con el periodo anterior.

## Fuera de alcance

- Registrar datos nuevos: no se añaden eventos a la auditoría ni se mide lo que no se midió. Por ejemplo, el coste de los cambios anteriores a `change.usage` sigue sin medirse.
- Un panel compartido entre clones, máquinas o cuentas: lee el clon local con todas sus worktrees, como el resto de `specty ui`.
- Rangos de fechas a medida y gráficas que la persona configure.
- El panel en el chat (MCP Apps) y en la extensión de VS Code.
- Las distribuciones «Pestañas por tema» y «Personas primero» que la persona descartó en la maqueta.

## Supuestos

- A1: Las fuentes son los cambios abiertos y archivados de todas las worktrees, con su `state.json` y su `audit.jsonl` (`changeRecords` y `archivedRecords` del servidor, que ya guarda en memoria los archivados mientras su estado no cambia), y las entradas de la memoria (`readMemory`); el panel no escribe nada en disco.
  - impacto: medio
- A2: Cada cambio cuenta para una sola persona, un agente y un modelo: la persona es `approved.by` de su estado (lo tienen los 630 estados de este repositorio), o si falta, el último `by` de su auditoría; el agente es el `tool` con más líneas `actor: agent` de su auditoría; el modelo es el `model` más frecuente de sus líneas (solo lo tienen 293 de 628 cambios). Sin dato, cuenta como «(sin dato)», que también se puede elegir.
  - impacto: alto
- A3: Los periodos son «7 días», «30 días» (por defecto), «90 días» y «Todo». Acaban hoy, en la fecha local. Cada hecho cuenta por la fecha de su evento: un cambio cerrado por su `change.closed`, una tarea por su `task.completed`, una verificación por su `task.verified` o `change.verified`, el coste por su `change.usage` y una aprobación por su `spec.approved`. Así, las tareas y las verificaciones de los cambios abiertos también cuentan. Las series van por día hasta 45 días y por semana, desde el lunes, por encima. La opción de 90 días no estaba en la maqueta.
  - impacto: alto
- A4: La comparación es con el periodo inmediatamente anterior de la misma duración, y «Todo» no compara. Cada indicador muestra la variación en % con ▲ o ▼, en verde o rojo según si subir es bueno (en el ciclo y el coste, bajar es bueno), y «sin datos en el periodo anterior» cuando ese periodo no tiene ninguno.
  - impacto: medio
- A5: El servidor agrega y la UI solo recibe agregados, como ya se hizo con la Bandeja para no mandar megas al navegador. `GET /api/stats?period=&who=&kind=` responde las cifras de todas las secciones con una función pura de core. La tabla de cambios llega por páginas de 25 desde `GET /api/stats/changes`, con búsqueda y orden. La exportación sale de `GET /api/stats/export?format=csv|json`, con los mismos filtros.
  - impacto: alto
- A6: Definiciones de los indicadores: «Cambios cerrados»; «Tareas completadas»; «Ciclo», la mediana de crear a cerrar de los cerrados; «Verificaciones que pasan», las `task.verified` con salida 0 entre todas; «Coste medido», la suma de `cost` de `change.usage`, siempre con «en N de M cambios»; «Pendientes abiertos», los pendientes, mejoras y recordatorios no hechos ni descartados al final del periodo. Las fases son: redactar la spec, de `change.created` a la primera `spec.proposed`; revisión, hasta la última `spec.approved`; implementación, hasta la última `task.completed`; aceptación y cierre, hasta `change.closed`. La espera a la persona es la revisión de los cambios aprobados en la terminal o en la UI.
  - impacto: medio
- A7: Las gráficas usan una paleta categórica validada para daltonismo y contraste en los dos temas. Son azul, naranja y aguamarina: `#2a78d6`, `#eb6834` y `#1baf7a` en claro, y `#3987e5`, `#d95926` y `#199e70` en oscuro. Van como tokens nuevos en `styles.css` (`--color-series-1` a `--color-series-3`, más `--color-chart-grid` y `--color-chart-axis`) y solo dentro de las gráficas. El resto de la UI sigue con su regla: solo tienen color las fases y los riesgos. Un fallo se marca con el tono de riesgo, con icono y texto. Los dos tonos de claro que quedan por debajo de 3:1 se compensan con la leyenda y la vista en tabla.
  - impacto: alto
- A8: Las gráficas son componentes propios de Angular en SVG, sin librería: columnas apiladas, línea con cursor, barras horizontales ordenadas, barra segmentada e indicador con minigráfica. Cada una tiene valores al pasar el puntero y con el foco del teclado, y «Ver tabla» con los mismos datos. Están en el catálogo con sus estados.
  - impacto: medio
- A9: La página vive en `/dashboard` con el título «Panel», en la barra entre Sesiones y Configuración. Lleva la cabecera, una sola fila de filtros (Periodo, Ver por, Carril y Exportar), la fila de indicadores y las secciones bajo divisores de documento (`components/document.ts`), en el orden de la selección. Los filtros van en la URL, así que recargar o compartir el enlace mantiene la vista.
  - impacto: medio
- A10: `specty stats [--period 7d|30d|90d|all] [--who person:<nombre>|agent:<herramienta>|model:<modelo>] [--kind <carril>] [--json]` imprime los indicadores con la comparación, una fila por persona, agente y modelo, el tiempo por fase y los cambios más caros. `--json` da lo mismo que `/api/stats`. Solo lee, así que también lo puede ejecutar el agente.
  - impacto: bajo
- A11: Todo texto nuevo está en español y en inglés: los de la UI con `t()` y los de la CLI en `packages/core/src/cards/`. Lo cuentan `docs/ui.md` (Panel), `docs/ARCHITECTURE.md` (§15 los endpoints y §6 `specty stats`) y `docs/formats.md` §9 si documenta la salida del comando.
  - impacto: bajo

## Criterios de aceptación

- AC1: CUANDO la persona abre «Panel» en `specty ui` ENTONCES ve, para los últimos 30 días y todos, seis indicadores, cada uno con su variación frente a los 30 días anteriores: cambios cerrados, tareas completadas, ciclo mediano, verificaciones que pasan, coste medido con en cuántos cambios se midió y pendientes abiertos.
- AC2: CUANDO elige otro periodo (7 días, 90 días o Todo), una persona, un agente, un modelo o un carril ENTONCES todos los indicadores, gráficas y tablas se recalculan para ese corte, y al recargar la página sigue igual.
- AC3: CUANDO elige «Todo» ENTONCES los indicadores no muestran comparación.
- AC4: CUANDO mira «Ritmo» ENTONCES ve los cambios cerrados por día (o por semana) apilados por carril, con leyenda, y las tareas completadas por día; al pasar el puntero o con el foco, cada día da sus valores.
- AC5: CUANDO mira «Personas y agentes» ENTONCES ve una fila por persona, agente y modelo, con cambios, tareas, ciclo mediano, verificaciones que pasan, sesiones y coste, y elegir una fila filtra el panel por ella.
- AC6: CUANDO mira «Flujo y esperas» ENTONCES ve el tiempo mediano por fase, quién aprobó las specs (el agente en modo delegado, la terminal o la UI), la espera mediana a la persona, las revisiones por spec y las sesiones por cambio.
- AC7: CUANDO mira «Calidad» ENTONCES ve las verificaciones de tarea que pasan por día, cuántas verificaciones completas fallaron de cuántas, los tests de contrato enviados y los bloqueados en rojo, los riesgos, los archivos largos y las aserciones quitadas, y los cambios con más verificaciones fallidas.
- AC8: CUANDO mira «Coste y tokens» ENTONCES ve el coste por día, los tokens por tipo, el coste por carril y los cambios más caros, y cuántos cambios del periodo tienen el coste medido.
- AC9: CUANDO mira «Alcance e integraciones» ENTONCES ve las solicitudes de alcance automáticas, aprobadas y rechazadas, las incorporaciones de main que pararon por conflictos o por la verificación, y los ajustes pedidos.
- AC10: CUANDO mira «Memoria» ENTONCES ve las entradas anotadas en el periodo por estado y por tipo.
- AC11: CUANDO mira «Cambios» ENTONCES ve los cambios del periodo con su fecha de cierre, título e id, carril, tamaño, agente, tareas, ciclo, verificaciones fallidas y coste, con búsqueda, orden por columna y páginas, y cada fila abre su cambio.
- AC12: CUANDO pulsa «Ver tabla» en una gráfica ENTONCES ve sus mismos datos en una tabla, y con el teclado llega a los valores de cada marca.
- AC13: CUANDO el periodo o el filtro no tienen ningún cambio ENTONCES el panel lo dice en un estado vacío, en lugar de mostrar gráficas vacías.
- AC14: CUANDO pulsa «Exportar» y elige CSV o JSON ENTONCES descarga una fila por cambio del corte que ve, con sus cifras, y el CSV se abre bien en una hoja de cálculo.
- AC15: CUANDO alguien ejecuta `specty stats` ENTONCES ve el resumen de los últimos 30 días con la comparación y una fila por persona, agente y modelo; con `--period`, `--who` y `--kind` cambia el corte, y con `--json` da los mismos datos que el panel.
- AC16: CUANDO las gráficas se ven en claro o en oscuro ENTONCES sus series se distinguen también con daltonismo y cumplen el contraste, y lo comprueba un test de los tokens.
- AC17: CUANDO salen los textos nuevos ENTONCES salen en español y en inglés.

## Diseño

- Core, puro, en `packages/core/src/stats/`. `rows.ts` saca de un estado y su auditoría la fila de un cambio: sus fechas, persona, agente y modelo, cuentas, tiempos por fase y coste. `period.ts` tiene los periodos, el filtro y la comparación. Cada sección es su propio módulo, con su función y su tipo de vista: `summary.ts`, `rhythm.ts`, `people.ts`, `flow.ts`, `quality.ts`, `cost.ts`, `scope.ts`, `memory.ts`, `table.ts` y `export.ts`. Los tipos de vista se exportan en `light.ts` y las funciones en `index.ts`. Los textos de `specty stats` van en `cards/stats.ts`.
- CLI. `server/stats.ts` atiende los tres endpoints de A5, registrados en `server/api.ts`; la exportación responde con su propio `Content-Type` y `Content-Disposition`. `commands/stats.ts` se registra en `program.ts`, en el grupo de lectura (`status`, `doctor`…).
- UI, en `packages/ui/src/dashboard/`. `dashboard-page.ts` lleva la distribución A, hay un componente por sección (`dashboard-rhythm.ts`…) y `dashboard-url.ts` lleva los filtros ⇄ la URL. Las gráficas van en `components/charts/`: `column-chart.ts`, `line-chart.ts`, `bar-list.ts`, `segmented-bar.ts`, `stat-tile.ts`, una información emergente común y la vista en tabla, en una página del catálogo. Los datos van por `SpectyData.stats()`, `statsChanges()` y `statsExport()`, en el servidor y en las muestras (`data/sample-stats.ts`). La ruta va en `app/routes.ts` y el enlace en `app/shell.ts`.
- Reglas de las gráficas (las de la maqueta): barras de 24 px como máximo, con el extremo redondeado de 4 px y recto en la base; líneas de 2 px; marcadores de 8 px con anillo del color de la superficie; 2 px de separación entre segmentos; rejilla fina y discreta; leyenda con dos o más series; etiquetas solo en el extremo; el texto nunca lleva el color de la serie; nunca dos ejes Y.
- Cada corte añade su sección como un componente y un módulo de core propios, así que los cortes paralelos chocan poco.

## Cortes

- C1: El panel muestra los indicadores clave con sus filtros
  - ac: AC1, AC2, AC3, AC13, AC17
- C2: El panel muestra el ritmo y una tabla por persona, agente y modelo
  - ac: AC4, AC5, AC12, AC16, AC17
  - depends: C1
- C3: El panel muestra el flujo, las esperas y la calidad
  - ac: AC6, AC7, AC12, AC17
  - depends: C2
- C4: El panel muestra el coste, el alcance, las integraciones y la memoria
  - ac: AC8, AC9, AC10, AC12, AC17
  - depends: C3
- C5: El panel lista los cambios del periodo con búsqueda, orden y páginas
  - ac: AC11, AC17
  - depends: C1
- C6: `specty stats` da el resumen del panel en la terminal
  - ac: AC15, AC17
  - depends: C2
- C7: El panel exporta los cambios del corte a CSV o JSON
  - ac: AC14, AC17
  - depends: C5

## Riesgos

- R1: Leer todo el archivo en cada petición puede ser lento con miles de cambios. Mitigación: el servidor ya guarda en memoria los archivados mientras su estado no cambia, la agregación es una pasada por los eventos y C1 incluye un test que agrega 2.000 cambios sintéticos en menos de un segundo.
- R2: Cifras engañosas: coste parcial, modelos sin dato o eventos antiguos sin `by`. Mitigación: cada cifra parcial dice sobre cuántos cambios se calcula, y «(sin dato)» aparece como una opción más, sin repartirse.
- R3: El color de las gráficas rompe la regla de que solo tienen color las fases y los riesgos. Mitigación: queda limitado a las marcas de las gráficas, con una paleta validada y un test de tokens. El texto y la interfaz siguen en tinta.
- R4: Varios cortes tocan la misma página y el mismo tipo de respuesta. Mitigación: cada sección es su propio componente y su propio módulo de core, y la página y la respuesta solo las enlazan.
