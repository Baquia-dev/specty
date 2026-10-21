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

### Bandeja

Arriba, tarjetas "Esperan tu decisión": spec por revisar, solicitud de alcance, resultado por aceptar y cierre por confirmar. Cada tarjeta muestra el cambio, la fase, el tamaño, cuánto tiempo lleva esperando y la acción directa. Debajo, los cambios activos agrupados por fase.

### Revisión de spec

- **Cabecera**: título, fase, revisión, rama, tamaño con sus razones y esfuerzo recomendado. Incluye el progreso de la revisión, por ejemplo "2 supuestos de alto impacto por confirmar".
- **Columna izquierda**: índice de secciones con indicadores (pendiente, comentado, aviso).
- **Centro**, en este orden:
  1. Objetivo y Fuera de alcance, editables en línea.
  2. Supuestos, como tarjetas con Confirmar / Rechazar y comentario.
  3. Criterios, con los avisos de vaguedad en línea.
  4. Archivos, en árbol por módulo, con insignias de crear / modificar / borrar y marca de ruta sensible.
  5. Tareas, con chips de criterios y de archivos. Se pueden reordenar en `draft` y `review`.
  6. Riesgos.
  7. Diseño, plegado, con Markdown enriquecido y código resaltado.
- **Columna derecha**: comentarios y actividad.
- **Comentarios**: al seleccionar texto o pasar el cursor sobre un ítem aparece "Comentar". Cada comentario se ancla al ítem o a la cita, y llega al agente en `specty next`.
- **Barra de acción fija**: "Pedir cambios" (envía los comentarios) y "Aprobar". "Aprobar" queda deshabilitado, con el motivo visible, mientras haya supuestos de alto impacto sin decidir o errores de validación.
- **Modo fuente** (CodeMirror), para quien prefiera editar el Markdown. El contenido es el mismo.

### Revisión del delta

Muestra "Qué cambió desde que aprobaste": ítems añadidos, modificados y eliminados, con diff por palabras. Las tareas nuevas que tocan archivos no previstos llevan la marca "posible alcance nuevo". "Ver spec completa" queda como acción secundaria.

### Progreso

Línea de tiempo de tareas: pendiente, activa, hecha o fallida. Cada tarea muestra su commit, sus archivos, la verificación (expandible, con su salida) y la duración. Las solicitudes de alcance aparecen en línea con Aprobar / Rechazar y motivo. Todo se actualiza en vivo.

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
