# 0016 · La memoria de Specty

- Estado: aceptada
- Fecha: 2026-10-30
- Enmienda: ARCHITECTURE §9 («no existe un archivo de estado global»)

## Contexto

Lo que un agente deja pendiente o propone mejorar vive en el chat o en la memoria privada de ese agente. Se pierde con `/clear`, con una sesión nueva o al cambiar de agente, y la persona no lo ve. Los «Pendientes» del cierre de un cambio solo llegan al cambio que lo sigue con `follows`.

Además, varias sesiones trabajan a la vez en el mismo clon, cada una en su worktree, y nada les dice qué hace cada una. El 2026-10-30 dos sesiones empezaron el mismo cambio con minutos de diferencia. Specty solo lo notó al proponer, como «archivos compartidos», y su SIGUIENTE pedía aprobar en modo delegado.

ARCHITECTURE §9 decía que las ramas permiten trabajar en paralelo y que por eso no existe un archivo de estado global: cada cambio guarda su estado en su rama. Coordinar sesiones y recordar lo pendiente necesita estado común a todas.

## Decisión

Specty tiene memoria propia, compartida por todas las sesiones y todos los agentes del clon, en dos mitades:

- **En vivo**, local y nunca versionada, en `.git/common/specty/`: qué conversación de qué agente trabaja en qué carpeta y cuándo dio su último paso (`activity/`). La anota el guard en cada evento, como mucho una vez por minuto por conversación y carpeta, y sin lanzar git. Con ella, `status` dice qué agente lleva cada cambio y marca como huérfano el que espera al agente sin que nadie trabaje en él (`memory.orphanAfterMin`).
- **Duradera**: los pendientes, las mejoras, los recordatorios y las decisiones de la persona, en una rama propia, `specty-memory`, sin historia común con el código (decisión de la persona del 2026-10-30).
  - Nadie la abre en una carpeta: Specty escribe en ella con sus propios commits, y todas las carpetas del clon la ven al instante.
  - Tiene su propio historial, no entra en los merges del código y GitHub la muestra como una rama más si se sube.
  - Se descartó guardarla en archivos de `.specty/` en las ramas del código: cada worktree tendría su copia hasta fusionar la principal, y lo anotado dentro de un cambio cancelado se quedaría en su rama.

Quién decide:

- Specty decide los casos claros: una entrada que ya tomó otro cambio, el mismo cambio de origen (`follows`) o la mitad de los archivos gobernados compartidos.
- La persona decide los dudosos, como un título parecido.
- Ningún modelo decide solo si dos trabajos son el mismo.
- Descartar una entrada de la memoria es solo de la persona y nunca se delega, como desbloquear un test (decisión de la persona del 2026-10-30): si lo pide un agente, la entrada queda propuesta para descartar.

## Consecuencias

- El estado común vive fuera de las ramas del código. Lo en vivo es local a cada clon; lo duradero viaja con la rama `specty-memory` si la persona la sube.
- Sin subir la rama, un disco perdido se lleva la memoria, como hoy la memoria privada de cada agente.
- Un agente sin hooks no anota actividad. Sus comandos de Specty sí cambian el estado del cambio, y un cambio cuyo `state.json` cambió hace poco no es huérfano.
- La épica «Memoria de Specty» llega por cortes: la actividad y los huérfanos (este ADR), la memoria duradera, tomar y cerrar pendientes, frenar el trabajo duplicado, la red del fin de turno, la bitácora del cambio y la UI.
