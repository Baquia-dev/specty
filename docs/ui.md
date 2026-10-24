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
- **Cambio**: pestañas Spec · Progreso · Aceptación · Historial. La pestaña inicial depende de la fase (o de `?tab=`); si la fase cambia mientras la persona mira, la pestaña no se mueve.
- **Épicas**: tablero de cortes con sus dependencias.
- **Trazabilidad**: buscar un archivo o una línea y ver su historia de cambios.
- **Ajustes**: configuración con validación.

## Pantallas

### Armazón

Una cabecera de una sola línea en cualquier ancho, que nunca se desplaza: specty, Bandeja y Catálogo y, a la derecha, "Buscar o ejecutar… ⌘K" (en pantallas de menos de 640 px, solo el icono, con ese nombre accesible) y el botón de **preferencias**. Este abre un menú bajo la cabecera con el tema (Claro, Oscuro, Sistema) y el idioma (Español, English, cada uno en su lengua); elegir aplica al momento sin cerrarlo, y Escape o pulsar fuera lo cierran. La paleta conserva sus comandos de tema e idioma; mientras las flechas recorren sus resultados, el foco se queda en el buscador (se puede seguir escribiendo) y la opción activa se anuncia. Solo se desplaza el contenido bajo la cabecera.

**Modo delegado** ([ADR 0010](decisions/0010-modo-delegado.md)): mientras está activo, la cabecera muestra un chip «Modo delegado» en tono de atención (en el teléfono, solo su icono), para que la persona no olvide que su agente decide por ella; al pulsarlo, un diálogo dice desde cuándo y quién lo activó y permite desactivarlo. El menú de preferencias tiene una sección «Modo delegado» con su estado y «Activar…» o «Desactivar…», y la paleta, el comando «Modo delegado…». Activarlo abre el aviso de `specty delegate on` en el idioma de la persona, y solo se activa con «Sí, que decida mi agente»; si la fuente lo rechaza (un servidor de solo lectura, por ejemplo), un aviso dice por qué y el diálogo sigue abierto. Si la fuente no sabe del modo delegado, no aparece nada de esto.

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
- **Comentarios**: al seleccionar texto o pasar el cursor sobre un ítem aparece "Comentar", solo mientras la spec está en revisión. Cada comentario se ancla al ítem o a la cita, y llega al agente en `specty next` cuando la persona pide los cambios.
- **Solo lectura**: si la fuente no deja decidir (un servidor que arrancó el agente, o una pestaña sin sesión), la revisión se ve como fuera de revisión: sin "Comentar", sin Confirmar / Rechazar ni el formulario de comentario. "Pedir cambios" y "Aprobar" siguen en su sitio pero desactivados, con el motivo como texto debajo y en el tooltip, para que se entienda por qué y cómo decidir (arrancar `specty ui` en la terminal). Mientras la fuente no responde, nada se desactiva: un rechazo se sigue explicando con un aviso.
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
- **Salida en vivo**: mientras Specty verifica la tarea en curso, su fila muestra «Verificando · 0:42», el comando y la salida tal como llega, con los mismos colores. Llega por un canal aparte (`SpectyData.watchRun`), no por las vistas derivadas, para que cada línea no recalcule la bandeja. Se ve abierta y se puede ocultar sin perder la línea del reloj; la salida fallida anterior se pliega mientras tanto. Va en un panel de altura fija desde la primera línea, para que la página no se mueva mientras llegan, y se desplaza por dentro cuando no caben, sin arrastrar la página al llegar a sus extremos. Al empezar, y al volver a mostrarlo, el panel se abre desde arriba (altura y opacidad) y la línea del reloj entra con un leve desvanecido, con `--duration-base` y `--ease-standard`; con movimiento reducido aparece sin animación. Sigue la última línea salvo que la persona suba a leer, y entonces «Ir al final» la devuelve; en pantalla quedan las últimas 500 líneas y las anteriores se cuentan. Un lector de pantalla oye cuándo empieza, cuándo termina y cómo salió, nunca línea a línea. Al terminar queda el resultado como cualquier verificación. En el prototipo la lanza la paleta con «Simular: verificar la tarea en curso».
- La tarea en curso se resalta y dice cuándo empezó. Todo se actualiza en vivo; si la fuente no puede hacer una acción, un aviso lo explica. Sin tareas, un estado vacío lo dice.

### Aceptación

- **Criterios** (vista por defecto): cada criterio es una fila de documento con su texto y, debajo, las tareas que lo cubren, con su commit y el veredicto de su última verificación. A la derecha va su estado: «Verificado» (todas sus tareas hechas y con verificación correcta), «Hecho, sin verificación», «Pendiente» o «Sin tarea». Encima, un resumen: «2 de 2 criterios verificados · 2 tareas hechas · 2 commits». La evidencia sale de lo que ya trae la vista del cambio (criterios de la spec y progreso de las tareas).
- **Matriz** (vista alternativa): criterios por tareas, en el orden de la spec. Cada celda cubierta es un botón con el estado de la tarea y su commit; la celda elegida muestra debajo esa tarea (resumen, archivos, commit, intentos y verificación). Una tabla ancha se desplaza de lado dentro de su caja. El selector «Vista» cambia entre esta, la de criterios y la de cambios, y la elección se recuerda en el navegador, como la agrupación de la Bandeja.
- **Acciones**: en aceptación, la cabecera y la barra compacta muestran «Pedir ajustes…» y «Aceptar resultado». «Aceptar resultado» confirma en un diálogo con las tareas hechas, sus commits y lo que viene después: el agente redacta el cierre o, en un cambio rápido, el cambio se cierra. «Pedir ajustes…» explica cómo clasificará el agente la petición (defecto, refinamiento o alcance nuevo), no deja enviarla vacía y la envía tal cual, como `specty adjust`. Cada criterio tiene «No se cumple…», que aparece al pasar o enfocar la fila y abre ese diálogo con la petición empezando por el criterio («AC2: »). Si la fuente no puede hacerlo, un aviso lo explica y el diálogo sigue abierto.
- Fuera de aceptación muestra la evidencia que haya, sin acciones; en cierre y en terminado, bajo el resumen, va la sección Cierre (ver «Cierre»).
- **Verificación completa**: si el proyecto tiene `verify.full`, encima de los criterios va su sección, con el comando a la derecha del divisor. Sin resultados dice «Sin ejecutar» y que corre todos los tests del proyecto, no solo los de cada tarea; con uno, «Correcta · 41 s · hace 2 min» o «Falló · 9 s · hace 2 min», con «Ver salida» para sus últimas líneas, abiertas cuando falló. En aceptación, «Ejecutar» (o «Ejecutar de nuevo») la pide a la fuente (`verifyChange`), y mientras corre se ve el mismo bloque en vivo de Progreso, por el mismo canal: una ejecución sin tarea es la completa. Un lector de pantalla oye «Verificando todo el cambio» y cómo terminó. El resultado queda en `audit.jsonl` como `change.verified` (formats.md §4), así que sigue ahí al volver. Hay una verificación a la vez por cambio: si ya corre otra, un aviso lo explica. En el prototipo, «Simular: alternar el resultado de la verificación completa» hace que la siguiente falle o pase.
- **Decidir con la verificación completa**: si el proyecto tiene `verify.full`, bajo «Aceptar resultado» (en la cabecera, no en la barra compacta) una línea dice si aún no se ha ejecutado (atenuada), si está corriendo, si es correcta (en verde) o si falló (en rojo); las acciones la siguen en vivo con `watchRun`. El diálogo de aceptar lo repite y sigue el estado mientras está abierto: sin ejecutar, ofrece «ejecutarla antes», que cierra el diálogo y la lanza; si falló, pide revisar su salida y el botón pasa a «Aceptar de todos modos», como pregunta `specty accept` en la terminal.
- **Cambios** (tercera vista del selector «Vista», que se recuerda como las otras): el diff del trabajo en el visor de diffs (ver «Lenguaje visual»), pedido a la fuente con `diff(change, task?)`. La barra «Qué cambios ver» ofrece «Todo el cambio» y cada tarea con commit (con una sola, no aparece), y el resumen da el rango: del commit de partida de la tarea a su commit, o del de la primera tarea al último. El título «Cambios» y esa barra (con «Unificado | Lado a lado») forman la franja fija del visor: al bajar por el diff se quedan bajo la barra compacta del cambio hasta que el diff termina. La primera carga muestra líneas de carga bajo la franja; al elegir otra cosa, el diff anterior sigue atenuado hasta que llega el nuevo, así la barra no se mueve y el foco sigue en ella. Si la fuente no puede darlo, lo dice con sus palabras; sin ningún commit, un estado vacío dice que aún no hay cambios que ver. «Ver diff» aparece junto al commit de cada tarea en la evidencia de un criterio (al pasar o enfocar la fila) y en el detalle de la matriz: lleva a «Cambios» con esa tarea elegida y el foco en el título de la vista.

### Cierre

- **Sección «Cierre»** (`acceptance/closing-view.ts`), en la pestaña Aceptación bajo el resumen y encima de la verificación completa: lo que redactó el agente en la sección Cierre de la spec, partido por sus títulos (`data/closing.ts`) en Resumen, Desviaciones, Decisiones y Pendientes, cada parte en markdown bajo su subtítulo; las vacías no aparecen y lo que no encaja va al final, sin título. A la derecha del divisor, su estado: «en redacción», «por confirmar» o «confirmado». Mientras el agente lo redacta, solo dice que lo está redactando. En un cambio terminado sigue ahí para leerla; un cambio rápido, que no tiene cierre, no la muestra.
- **«Confirmar y archivar»** (`acceptance/closing-actions.ts`): en la cabecera amplia y en la barra compacta, solo con el cierre enviado, como «Aceptar resultado» en aceptación. Abre un diálogo que dice qué pasa (el cambio termina y se archiva con su cierre) y que no se puede deshacer (lo pendiente va en un cambio nuevo), con «Cancelar» y «Confirmar y archivar». Confirma como `specty close` (`confirmClosing`); al terminar, un aviso lo dice, la cabecera pasa a «Terminado», las acciones desaparecen y la página sigue en Aceptación con el cierre a la vista. Si la fuente no puede, un aviso explica por qué y el diálogo sigue abierto.
- La revisión dice «aceptada, en cierre» mientras el agente redacta y «cierre por confirmar» cuando lo envió.
- Más adelante: las actualizaciones de documentos que proponga el cierre.

### Historial y trazabilidad

- Línea de tiempo de eventos, con filtros por actor y tipo. Una decisión de la persona que tomó su agente en modo delegado ([ADR 0010](decisions/0010-modo-delegado.md)) lleva el detalle «Por delegación: lo decidió el agente», y la nota de una aprobación delegada dice «Aprobada el … por el agente de …».
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
- Selector segmentado (`components/segmented.ts`, en «Componentes» del catálogo): para elegir una entre pocas opciones cortas, todas a la vista («Unificado | Lado a lado»); con muchas o largas, el select. Son radios nativos con estilo de segmentos, así que el navegador da el teclado y la semántica: Tab entra en la opción elegida, las flechas mueven y eligen, y el grupo se anuncia por su etiqueta (visible, o solo para el lector con `hideLabel`). Mide como los campos (36 px; las opciones, 32 px, y 40 px en pantallas táctiles); la opción elegida va sobre un fondo tenue y en semibold, el foco se dibuja sobre la opción, y si no caben pasan a la línea siguiente.
- Visor de diffs (`components/diff-viewer.ts` y `components/diff-file.ts`, en «Componentes» del catálogo): muestra un diff de git ya leído con `parseDiff`. Arriba va una franja fija: el título que ponga quien lo usa (`[diffHeading]`), su barra (en el catálogo, «Todo el cambio · T1 · T2») y «Unificado | Lado a lado», que se recuerda en el navegador; por debajo de 640 px solo hay vista unificada y ese selector no aparece. Al bajar, la franja se queda bajo la barra compacta del cambio (`--sp-sticky-top`; arriba del todo donde no la hay), sobre el fondo de la página, hasta que el diff termina. Sin archivos que mostrar aún (`files` sin valor), en lugar del diff va el estado que ponga quien lo usa (`[diffStatus]`: carga o error), y con `busy` el diff atenuado espera al siguiente; así la franja nunca se mueve. Debajo, un resumen («5d2a7b0 → 8b0a4f6 · 4 archivos · +98 −2»), la lista de archivos cuando hay más de uno (cada uno, un botón que lleva el foco a su cabecera) y los archivos. Cada archivo tiene una cabecera que lo pliega, con su ruta (y la anterior si se renombró), su estado y sus líneas añadidas y quitadas, y sus bloques con la cabecera `@@`, el número de cada lado, el signo y las palabras que cambiaron marcadas. Lado a lado empareja cada tanda de líneas quitadas con las añadidas que la siguen. Un archivo de más de 60 líneas muestra las 40 primeras y «Mostrar N líneas más», que lleva el foco a la primera línea nueva; uno binario dice que no se muestra. Los fondos son tokens propios (`--color-diff-added`, su variante `-word` para las palabras y `-text` para el signo y las cuentas; igual con `removed`), con pares de contraste comprobados en claro y en oscuro. Para un lector de pantalla, números y signos quedan ocultos: cada línea cambiada empieza por «Añadida:» o «Quitada:», cada bloque dice «Desde la línea N» y su sección, y lado a lado la línea de contexto se oye una vez.
- Resaltado de sintaxis en el visor (`highlight/`): el diff se ve al momento sin colores y se colorea cuando Shiki termina. Shiki (núcleo, motor de expresiones regulares de JavaScript, sin WASM) se descarga con `import()` la primera vez que se ve un diff, y cada gramática la primera vez que aparece un archivo suyo: nada de eso entra en la carga inicial. Se resaltan 30 lenguajes elegidos por extensión o nombre (`highlight/languages.ts`: TypeScript, JavaScript, JSON, CSS, HTML, Markdown, YAML, shell, Dockerfile, Python, Go, Rust, Java, Kotlin, Swift, Dart, C, C++, C#, PHP, Ruby, SQL, GraphQL, XML, Vue, Svelte…); los demás, los binarios y los de más de 2.000 líneas se ven sin colores, igual que si algo falla, sin mostrar errores. Cada lado de cada bloque se resalta como un trozo de código (el antiguo para las líneas quitadas, el nuevo para las demás), y cada línea se pinta en tramos (`spansOf`) que llevan su color y, si es una palabra cambiada, su fondo. Los colores son tokens propios (`--color-code-keyword`, `-string`, `-comment` en cursiva, `-function` y `-constant`) a través del tema de variables CSS de Shiki, y cada uno cumple 4,5:1 sobre la superficie y los cuatro fondos del diff en los dos temas; por eso, en oscuro, el fondo de las palabras cambiadas es más suave que en claro. El resaltado se inyecta (`HIGHLIGHT`), así que los tests y otros anfitriones pueden cambiarlo.

## Stack

Decidido en el [ADR 0009](decisions/0009-angular-para-la-ui.md):

- Angular 22 standalone, sin zone.js, con signals y plantillas estrictas; TypeScript 6.0 solo en `packages/ui`.
- Tailwind CSS 4 con tokens propios.
- Componentes propios sobre las primitivas accesibles de Angular Aria y el CDK.
- `animate.enter`/`animate.leave` y transiciones CSS para el movimiento; `resource()` y signals para el estado del servidor.
- CodeMirror 6 para el modo fuente, Shiki para el resaltado, combobox de Angular Aria para la paleta de comandos, `@lucide/angular` para los iconos y un visor de diffs propio (`components/diff-viewer.ts`).
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
- Solo se decide desde la UI si la persona arrancó `specty ui` en su terminal: el agente que lo arranca vería el enlace, así que su servidor es de solo lectura (decisión del 2026-10-24).
- Los enlaces usan `localhost`, porque WebAuthn no admite direcciones IP como identificador de origen.
- Opcionalmente (fase 4), las aprobaciones exigen presencia del usuario con WebAuthn.
