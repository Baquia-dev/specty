# Specty

Specty hace cumplir el desarrollo guiado por especificaciones cuando se programa con agentes de IA. Ningún agente escribe código sin una spec aprobada por una persona, cada tarea queda en un commit trazable y cualquier cambio, del agente o manual, se puede rastrear hasta la spec que lo justifica. Funciona dentro del chat del agente que ya usa cada persona (Claude Code, Cursor, Codex, Antigravity, Gemini CLI, Copilot, Windsurf…), sin claves de API.

Repositorio: `github.com/Baquia-dev/specty` · npm: `@baquia-dev/specty` (comando `specty`) · Licencia: [Apache-2.0](LICENSE)

Diseño técnico: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Formatos: [docs/formats.md](docs/formats.md) · UI: [docs/ui.md](docs/ui.md) · Decisiones: [docs/decisions/](docs/decisions/)

## Problema

- Los agentes escriben código de inmediato a partir de prompts vagos. Después nadie sabe qué se hizo, dónde ni por qué.
- Escribir specs a mano es tedioso, y quien las escribe omite detalles que el modelo sí podría explicitar.
- Las reglas en prosa son obediencia blanda: el modelo se las salta, sobre todo cuando el flujo lo bloquea sin ofrecerle un camino legítimo.
- Cada herramienta espera su propia configuración, y una mala configuración hace que el agente pierda contexto.
- Los cambios manuales y los del agente se mezclan sin registro, y auditarlos después es imposible.

## Para quién

- **Desarrollador individual** (modo por defecto): control y trazabilidad sin ceremonia.
- **Equipos** (modo opcional): un estándar común, aprobaciones verificadas en el servidor y auditoría.

## Qué percibe quien lo usa

- **Control**: nada se codifica sin su aprobación, y siempre sabe en qué fase está cada cambio y qué sigue.
- **Menos pérdida de contexto**: el agente recibe solo lo que necesita para la tarea actual.
- **Menos iteraciones**: las dudas y las suposiciones se resuelven antes de escribir código.

## Cómo funciona

1. La persona pide un cambio en el chat de su agente.
2. El agente redacta la spec: objetivo, fuera de alcance, supuestos, criterios de aceptación, archivos, tareas y riesgos. Specty la valida, calcula su tamaño, recomienda el nivel de esfuerzo del modelo y, si es demasiado grande, propone dividirla.
3. La persona la revisa en la UI de Specty (confirma supuestos, comenta, edita) y la aprueba.
4. El agente implementa tarea por tarea. Specty comprueba el alcance, ejecuta la verificación y hace un commit por tarea.
5. La persona revisa el resultado y lo acepta o pide ajustes. Cada ajuste se clasifica como defecto, refinamiento o alcance nuevo, y las tareas nuevas vuelven a aprobación mostrando solo lo que cambió.
6. Al aceptar, el agente redacta el cierre y Specty archiva el cambio con su registro de auditoría.
7. Si alguien intenta commitear código sin spec, Specty lo detiene hasta documentarlo (retro-spec). Si hay una spec activa, el cambio manual queda registrado en ella.

## Principios

1. **El flujo lo gestiona Specty, no el agente.** El agente pregunta qué hacer (`specty next`), lo hace y reporta.
2. **El camino legítimo es el más fácil.** Todo bloqueo explica el motivo y ofrece el siguiente paso válido.
3. **Lo que concede permisos lo decide una persona**: aprobar, ampliar alcance, aceptar y cerrar.
4. **Defensa en profundidad**: hooks del agente, hooks de git y CI. El CI es la garantía final.
5. **Contexto justo a tiempo**: instrucciones mínimas siempre cargadas; el detalle llega con cada tarea.
6. **Una sola fuente de verdad**: lo que se puede derivar de git no se duplica.
7. **Agnóstico**: sirve cualquier agente que pueda ejecutar comandos de terminal, sin claves de API.
8. **Sin rastro en la aplicación**: Specty no añade dependencias al código del usuario.
9. **Bilingüe**: specs y configuración en español o inglés.

## Alcance de la versión 1

- Flujo completo de cambios desde el chat del agente, con carriles rápido, estándar, spike, retro y épica.
- UI web local para revisar, aprobar, aceptar y auditar.
- Detección de proyectos existentes y configuración de proyectos nuevos.
- Hooks para las herramientas que los soportan; hooks de git y CI para todas.
- Trazabilidad línea a línea (`specty why`) e informe de auditoría.
- Exportación a OpenSpec, GitHub Spec Kit y Kiro.

## Fuera de alcance

- Llamar a modelos de lenguaje o gestionar claves de API ([ADR 0001](docs/decisions/0001-sin-llm.md)).
- Ser un runtime de agentes u orquestar varios agentes.
- Sustituir el CI o la revisión de código.
- Proteger contra personas o agentes que quieran evadirlo deliberadamente con acceso de escritura al repositorio (ver el [modelo de confianza](docs/ARCHITECTURE.md#modelo-de-confianza)).

## Decisiones fundacionales

| ADR | Decisión |
| --- | --- |
| [0001](docs/decisions/0001-sin-llm.md) | Specty no invoca modelos (por ahora) |
| [0002](docs/decisions/0002-formato-propio.md) | Formato de spec propio, con exportadores |
| [0003](docs/decisions/0003-ui-web-local.md) | UI web local primero, con rediseño completo |
| [0004](docs/decisions/0004-modo-individual-por-defecto.md) | Modo individual por defecto; modo equipo opcional |
| [0005](docs/decisions/0005-repo-nuevo.md) | Repo nuevo con portado selectivo del legacy |
| [0006](docs/decisions/0006-specty-gestiona-el-flujo.md) | Specty es la máquina de estados; el agente, un trabajador sin estado |
| [0007](docs/decisions/0007-nombre-y-organizacion.md) | Specty bajo la organización Baquia-dev; npm `@baquia-dev/specty` |
| [0008](docs/decisions/0008-licencia-apache.md) | Licencia Apache-2.0; lo generado en repos de usuarios, MIT-0 |

## Cómo sabremos que funciona

- El 100 % de los commits en rutas gobernadas es trazable a un cambio (verificado en CI).
- Las rondas de ajuste por cambio tienden a bajar.
- La mayoría de los intentos de saltarse el flujo se bloquean en local, antes de llegar al CI.
- La suite de cumplimiento pasa con cada agente y modelo soportado.
- Baja el tiempo desde la petición hasta la spec aprobada.

## Diferenciación

Spec Kit, Kiro, OpenSpec y Antigravity ayudan a generar specs y planes. Specty se centra en lo que esas herramientas dejan al criterio del modelo: hacer cumplir el flujo en cualquier herramienta, trazar cada línea de código hasta su spec y documentar también los cambios manuales. Exporta a sus formatos para no encerrar a nadie.
