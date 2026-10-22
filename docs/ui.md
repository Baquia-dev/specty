# UI de Specty

Brief de diseño de la UI web local. Objetivo: que la persona revise **decisiones**, no documentos, y que nunca necesite abrir el Markdown.

## Metas medibles

- Revisar y aprobar una spec de tamaño M en menos de 3 minutos.
- Re-aprobar un ajuste en menos de 30 segundos, porque solo se revisa el delta.
- Toda acción frecuente es accesible con el teclado.
- Primera carga en menos de 1 s en local. Las actualizaciones en vivo llegan en menos de 300 ms tras el cambio en disco.

## Principios

1. **Decisiones antes que prosa.** Supuestos, alcance y riesgos van arriba; el diseño detallado, plegado.
2. **Lo riesgoso primero.** Borrados, rutas sensibles, dependencias nuevas y "posible alcance nuevo" se ven sin tener que buscarlos.
3. **Solo lo que cambió.** Toda re-revisión abre en el delta.
4. **Siempre en vivo.** El estado se actualiza solo (SSE); nunca hay que recargar.
5. **Una acción primaria por pantalla.** Si está deshabilitada, dice por qué.
6. **Teclado primero.** Paleta de comandos (⌘K), navegación con `j`/`k` y atajos visibles.
7. **Calma visual.** Densidad media, tipografía cuidada y movimiento corto (≤ 200 ms) y con propósito; respeta `prefers-reduced-motion`.
8. **Accesible.** WCAG 2.2 AA; el color nunca es la única señal (siempre va con icono y texto).
9. **Claro y oscuro; español e inglés.**

## Arquitectura de información

- **Bandeja** (inicio): primero lo que espera una decisión de la persona, luego los cambios activos por fase y después los recientes.
- **Cambio**: pestañas Spec · Progreso · Aceptación · Historial. La pestaña inicial depende de la fase.
- **Épicas**: tablero de cortes con sus dependencias.
- **Trazabilidad**: buscar un archivo o una línea y ver su historia de cambios.
- **Ajustes**: configuración con validación.

## Pantallas

### Armazón

Una cabecera de una sola línea en cualquier ancho, que nunca se desplaza: specty, Bandeja y Catálogo y, a la derecha, "Buscar o ejecutar… ⌘K" (en pantallas de menos de 640 px, solo el icono, con ese nombre accesible) y el botón de **preferencias**. Este abre un menú bajo la cabecera con el tema (Claro, Oscuro, Sistema) y el idioma (Español, English, cada uno en su lengua); elegir aplica al momento sin cerrarlo, y Escape o pulsar fuera lo cierran. La paleta conserva sus comandos de tema e idioma; mientras las flechas recorren sus resultados, el foco se queda en el buscador (se puede seguir escribiendo) y la opción activa se anuncia. Solo se desplaza el contenido bajo la cabecera.

### Bandeja

Todos los cambios en filas de documento, sin tarjetas: por defecto, "Esperan tu decisión" (spec por revisar, solicitud de alcance, resultado por aceptar y cierre por confirmar), "En curso" y "Recientes", lo que más espera primero. Cada fila muestra la fase con cuánto lleva debajo (en el teléfono, al lado), el título, qué espera con su tamaño, las notas que piden atención (supuestos de alto impacto, solicitud de alcance), el avance de las tareas en curso y, si espera a la persona, la acción directa; la fila elegida con j/k se resalta, su acción es la principal y, si hace falta, se desplaza a la vista sin quedar bajo la barra fija.

- **Barra fija**: el buscador, los filtros por fase y "X de N cambios" quedan arriba al desplazarse, de ancho completo como la barra compacta del cambio; su línea inferior aparece solo mientras está fija. En el teléfono las fases van en una sola línea que se desplaza de lado.
- **Buscador** por título o id, sin distinguir mayúsculas ni tildes; `/` lo enfoca y Escape lo vacía.
- **Filtros por fase**, cada una con su número; elegir otra vez la fase activa vuelve a "Todas".
- **Agrupar** por estado, por fase o sin agrupar, y **ordenar** por lo que más espera, lo más reciente, título o tamaño, con el select propio del sistema de diseño; van en la cabecera, junto al título, porque se tocan poco.
- Con un filtro activo se ve cuántos cambios se muestran de cuántos; si ninguno coincide, un estado vacío con "Limpiar filtros".
- La URL siempre queda limpia: agrupar y ordenar se recuerdan en el navegador, como el tema; la búsqueda y la fase duran la sesión (siguen al entrar a un cambio y volver).

### Revisión de spec

Se lee como un documento bien maquetado, no como un tablero de tarjetas.

- **Cabecera amplia**, arriba del todo: ruta de vuelta, fase con lo que espera de la persona y desde cuándo, título grande y una franja de datos. Debajo, las pestañas.
  - **Franja de datos**: revisión, rama, tamaño con sus razones y lo que queda por decidir (por ejemplo, "1 supuesto de alto impacto"). Desde 1024 px, una fila donde cada dato ocupa el ancho de su contenido, con líneas finas entre ellos; más estrecha, dos columnas (tres desde 640 px) sin líneas verticales, con la rama al final en una fila entera.
  - **Revisión**: con su número y su estado, nunca un «r3» suelto, aquí ni en el resto de la UI: «Revisión 3 · por aprobar» y, si hay una aprobada, cuál, cuándo y quién la aprobó («La 2 está aprobada · 21 oct · Ana Gómez»). Los estados siguen la fase: sin proponer, por aprobar, aprobada, aprobada en ajuste, cierre por confirmar, cerrada y cancelada.
  - **Rama**: siempre completa; si es larga, se parte en varias líneas.
  - **Esfuerzo recomendado**: oculto por ahora (`SHOW_EFFORT_HINT` en `change/change-page.ts`); el esfuerzo se sigue calculando. Cuando se muestra, no es un dato del cambio sino una sugerencia, así que va a la derecha del título, bajo las acciones, atenuado y con una bombilla: «Sugerencia para el agente: implementar con esfuerzo medio y revisar con alto» (en borrador, «planificar»). Una vez escrita la spec, el nivel de planificación sirve para ajustarla y decidir el alcance.
  - **En el teléfono**: el título baja a 28 px y el tiempo va en su propia línea; las acciones, bajo el título, empiezan en su borde.
- **Barra compacta fija**: aparece, con una transición, cuando la cabecera amplia sale de la vista. Muestra la fase, el título recortado, la revisión («Revisión 3 · por aprobar»; en el teléfono, solo «Revisión 3»), la sección que se está leyendo ("§ 04 Criterios", desde 1280 px) y, a la derecha, solo la decisión: en revisión, "Pedir cambios" y "Aprobar revisión 3" en pequeño, con el motivo del bloqueo en el tooltip. Desde 768 px va en una sola línea y lo que cede es el título, que se recorta; en el teléfono las acciones bajan a una segunda línea. Mientras está oculta es `inert`.
- **Columna izquierda**: índice "Contenido" numerado, con indicadores (pendiente, comentado, aviso). Al elegir una sección, la página se desplaza hasta ella y la sección se resalta un momento: la línea de su divisor se dibuja, el número se oscurece y el fondo se ilumina. Con movimiento reducido no hay transición.
- **Centro**: cada sección empieza con un divisor tipográfico (número "§ 0N", línea fina y su progreso a la derecha), seguido del título, una línea con lo que se espera de quien revisa y el contenido. Los ítems van con sangría bajo el título de la sección, con su identificador en una columna fija y sin líneas entre ellos: el ítem bajo el puntero o con el foco se ilumina con un fondo suave y muestra «Comentar». El divisor de cada sección es la única línea. En este orden:
  1. Objetivo y Fuera de alcance, editables en línea.
  2. Supuestos, con su decisión (color, icono y texto) y comentario. Los pendientes ofrecen Confirmar / Rechazar; los ya decididos, un "Cambiar decisión" discreto que vuelve a mostrarlos. El de alto impacto sin decidir lleva además un fondo tenue.
  3. Criterios, con los avisos de vaguedad en línea.
  4. Archivos, en árbol por módulo, con insignias de crear / modificar / borrar y marca de ruta sensible.
  5. Tareas, con chips de criterios y de archivos. Se pueden reordenar en `draft` y `review`.
  6. Riesgos.
  7. Diseño, plegado, con Markdown enriquecido y código resaltado.
- **Columna derecha**: comentarios y actividad.
- **Comentarios**: al seleccionar texto o pasar el cursor sobre un ítem aparece "Comentar". Cada comentario se ancla al ítem o a la cita, y llega al agente en `specty next`.
- **Acciones**: "Pedir cambios" (envía los comentarios) y "Aprobar", en la cabecera amplia, a la derecha del título, y en la barra compacta al desplazarse; no hay barra en el pie. "Aprobar" queda deshabilitado mientras haya supuestos de alto impacto sin decidir o errores de validación, con el motivo como texto debajo de los botones de la cabecera y en el tooltip. Se muestran en cualquier pestaña mientras el cambio está en revisión.
- **Modo fuente** (CodeMirror), para quien prefiera editar el Markdown. El contenido es el mismo.
- **En el teléfono**: el índice va encima del documento y se desplaza con él (solo se fija desde 768 px, cuando queda al lado). Cada ítem lleva su id y sus marcas en la primera línea y el texto a todo el ancho debajo, en la revisión y en el delta. En pantallas táctiles «Comentar» se ve siempre, porque no hay puntero que lo revele. Nada ensancha la página: las rutas largas se parten y los filtros del delta se desplazan de lado dentro de su grupo.

### Revisión del delta

Muestra «Qué cambió desde la revisión 2» y, encima, cuál está aprobada, cuándo y quién la aprobó («La 2 está aprobada · 19 oct · Ana Gómez»; en un equipo no siempre es quien mira): ítems añadidos, modificados y eliminados, agrupados por sección, con filtros (Todo, Añadidos, Modificados, Eliminados) y su número. "Ver spec completa" queda como acción secundaria.

- **Modificado**: el texto final, limpio, con lo nuevo resaltado con suavidad (fondo tenue y subrayado fino). Solo si se quitaron palabras, una línea «Antes» atenuada con lo quitado tachado. La puntuación se compara aparte, y cada tramo cambiado se muestra entero, no en trocitos.
- **Añadido**: texto normal con su marca. **Eliminado**: atenuado y tachado.
- **Tareas**: título y chips de criterios y archivos, como en la revisión; los chips añadidos o quitados se distinguen, y el archivo que es "posible alcance nuevo" va en ámbar con icono y su aviso. Lo que cambia sin texto propio (impacto de un supuesto, verificación o tipo de una tarea) se cuenta en una línea aparte.

### Progreso

Las tareas, en el orden de la spec, como filas de documento (igual que los ítems de la revisión). Cada una muestra su id, título, estado (hecha, en curso o pendiente, con color, icono y texto), resumen, commit, archivos, criterios, duración, intentos y su última verificación (correcta o fallida, con su duración y su comando). Encima van un resumen («2 de 3 tareas hechas · 37 min de trabajo · 1 decisión te espera») y una barra con un tramo por tarea.

- **Te espera**: la tarea que necesita una decisión de la persona (hoy, una solicitud de alcance) sale de su lugar y aparece arriba con la solicitud: la ruta, el motivo del agente y qué implica decidir. «Aprobar» la aprueba; «Rechazar…» pide el motivo en un diálogo, como al rechazar un supuesto, porque el agente lo lee. Una vez decidida, la tarea vuelve a su lugar con una entrada corta (sin movimiento si se pide reducirlo).
- **Salida**: solo una verificación fallida guarda sus últimas líneas (`outputTail` en `audit.jsonl`), así que solo ella ofrece «Ver salida»; en la tarea en curso se ve abierta. Sus líneas llevan colores que las contextualizan, reconociendo marcas habituales de los ejecutores de tests: en rojo los fallos (`[E]`, `✗`, `FAIL`, `Error`, `-1`, la línea «Actual:»), en verde los aciertos (`✓`, `+6`, «All tests passed», la línea «Expected:»), en azul las rutas con línea y columna, y atenuados los tiempos. Son los colores de fase, que cumplen el contraste en los dos temas, y nunca la única señal: el texto ya dice qué falló.
- **Salida en vivo**: mientras Specty verifica la tarea en curso, su fila muestra «Verificando · 0:42», el comando y la salida tal como llega, con los mismos colores. Llega por un canal aparte (`SpectyData.watchRun`), no por las vistas derivadas, para que cada línea no recalcule la bandeja. Se ve abierta y se puede ocultar sin perder la línea del reloj; la salida fallida anterior se pliega mientras tanto. Sigue la última línea salvo que la persona suba a leer, y entonces «Ir al final» la devuelve; en pantalla quedan las últimas 500 líneas y las anteriores se cuentan. Un lector de pantalla oye cuándo empieza, cuándo termina y cómo salió, nunca línea a línea. Al terminar queda el resultado como cualquier verificación. En el prototipo la lanza la paleta con «Simular: verificar la tarea en curso».
- La tarea en curso se resalta y dice cuándo empezó. Todo se actualiza en vivo; si la fuente no puede hacer una acción, un aviso lo explica. Sin tareas, un estado vacío lo dice.

### Aceptación

- Lista de criterios, cada uno con su evidencia: tareas que lo cubren, commits y verificación.
- Diff por tarea o completo, unificado o lado a lado.
- Botón "Ejecutar verificación completa"; la ejecuta el servidor.
- Acciones: "Aceptar" o "Pedir ajustes". El cuadro de ajustes explica cómo se clasificará la petición.

### Cierre

Muestra lo que redactó el agente: resumen, desviaciones del plan, decisiones y pendientes, junto con las actualizaciones de documentos que propone. Acción: "Confirmar y archivar".

### Historial y trazabilidad

- Línea de tiempo de eventos, con filtros por actor y tipo.
- Exportación a Markdown, JSON, OpenSpec, Spec Kit y Kiro.
- Vista de trazabilidad: un archivo con un margen tipo blame que enlaza cada bloque con su cambio, tarea y criterio.

### Carga, estados vacíos y errores

Esqueletos de carga en lugar de spinners. Cada error dice qué pasó y qué hacer. Si se pierde la conexión con el servidor, un aviso discreto reintenta solo.

## Lenguaje visual

Punto de partida para el sistema de diseño:

- Base neutra con un solo color de acento.
- Colores semánticos por fase, siempre acompañados de icono y texto: borrador gris, revisión ámbar, implementación azul, aceptación violeta, terminado verde, cancelado rojo apagado.
- Tipografía sans para la interfaz y monoespaciada para rutas, comandos y código.
- Escala de espaciado de 4 px, radios moderados, sombras mínimas e iconos de trazo (Lucide).

**Dirección elegida: Tinta** (2026-10-21, entre cuatro propuestas). Los valores viven solo en `packages/ui/src/styles.css`, y el catálogo (`pnpm --filter @baquia-dev/specty-ui exec ng serve`, en `/catalog`) los muestra en vivo.

- En claro, neutros fríos de la escala zinc: fondo `#FAFAFA`, superficie `#FFFFFF`, texto `#18181B`.
- En oscuro, grises mate como los de Taiga UI (2026-10-22, porque el casi negro cansaba la vista): fondo `#222222`, superficie `#292929`, borde `#3A3A3A`, texto al 90 % `#E8E8E8` (13:1 sobre el fondo, frente a los 17,8:1 de antes) y fases desaturadas. Un test pone un techo de 14:1 al texto sobre el fondo.
- El acento es la propia tinta, sin tono (`#18181B` / `#E8E8E8`): el único color de la pantalla es el de las fases y los riesgos. Por eso los enlaces van subrayados.
- El foco se dibuja hacia dentro, sobre el borde del propio componente, con tonos mate agrisados: negro mate `#3F3F46` en claro y blanco mate `#C8C8C8` en oscuro. Sobre el acento (el botón primario) se invierte. Los enlaces dentro de un texto mantienen la separación para no tapar las letras.
- Geist para la interfaz y Geist Mono para rutas, comandos, ids y código, autoalojadas (sin red).
- Las ocho fases: `adjusting` comparte el azul de implementación y `closing` el violeta de aceptación; se distinguen por icono y nombre.
- Todos los pares de texto cumplen 4,5:1 en claro y en oscuro (lo comprueba un test).
- Patrones de documento (`components/document.ts`, página "Patrones" del catálogo): divisor de sección con título en versalitas, línea fina y contador; listas con sangría bajo su sección y filas sin líneas que se iluminan al pasar el puntero o con el foco y revelan sus acciones; un ancho de página común (72 rem). Y un estado vacío (`components/empty-state.ts`) con icono, título, qué pasó y cómo seguir.
- El catálogo usa ese mismo ancho, con su menú a la izquierda, fijo al desplazarse; en el teléfono, el menú es una línea que se desplaza de lado. Sus colores siguen el lenguaje de documento: filas sin tarjetas (muestra, token, uso y valor) bajo divisores de sección.
- Select propio (`components/select.ts`, en «Componentes» del catálogo): un desplegable con el estilo de la UI en lugar del del sistema. Está hecho sobre Angular Aria (un combobox sobre un listbox), con el teclado de un select nativo: clic, Enter, Espacio, ↓ o Alt+↓ lo abren; las flechas, Inicio/Fin o escribir mueven; Enter o clic eligen; Escape o salir lo cierran sin cambiar. El foco se queda en el disparador y la opción activa se anuncia. La lista es un panel como el de los menús, con una marca en la opción elegida; se abre debajo, o encima si no cabe, y es al menos tan ancha como el disparador. Como la de los menús, se recoloca junto a su botón al abrir, cuando cambia de tamaño y al desplazarse la página (`components/overlay-follow.ts`).

## Stack

Decidido en el [ADR 0009](decisions/0009-angular-para-la-ui.md):

- Angular 22 standalone, sin zone.js, con signals y plantillas estrictas; TypeScript 6.0 solo en `packages/ui`.
- Tailwind CSS 4 con tokens propios.
- Componentes propios sobre las primitivas accesibles de Angular Aria y el CDK.
- `animate.enter`/`animate.leave` y transiciones CSS para el movimiento; `resource()` y signals para el estado del servidor.
- CodeMirror 6 para el modo fuente, Shiki para el resaltado, combobox de Angular Aria para la paleta de comandos, `@lucide/angular` para los iconos y un visor de diffs por evaluar.
- Tests con el builder de tests de Angular y Vitest.
- Presupuesto: menos de 300 KB gzip en la carga inicial; el resto, bajo demanda.

**Requisito de arquitectura:** la capa de datos se abstrae del transporte: `fetch` + SSE hoy; `postMessage` en la webview de VS Code y MCP Apps después. Así, el mismo bundle sirve a los tres anfitriones.

## Proceso

1. **Sistema de diseño**: tokens, tipografía y componentes base, en un catálogo navegable.
2. **Prototipo navegable** de los flujos clave, con datos de ejemplo.
3. **Prueba con 3–5 desarrolladores**, con 5 tareas:
   - aprobar una spec;
   - pedir cambios;
   - aprobar una ampliación de alcance;
   - aceptar con ajustes;
   - encontrar por qué existe una línea de código.
4. **Implementación** por pantallas, en el orden del flujo.

## Seguridad

- El servidor escucha solo en `127.0.0.1`.
- Usa un token de sesión, comprueba `Host` y `Origin` (contra DNS rebinding), exige un token CSRF en las mutaciones y no habilita CORS.
- Los enlaces usan `localhost`, porque WebAuthn no admite direcciones IP como identificador de origen.
- Opcionalmente (fase 4), las aprobaciones exigen presencia del usuario con WebAuthn.
