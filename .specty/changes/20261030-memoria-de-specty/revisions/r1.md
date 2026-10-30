---
kind: epic
---

# Memoria de Specty: sesiones, pendientes y trabajo sin duplicar

## Objetivo

Hoy lo que un agente deja pendiente o propone mejorar vive en el chat o en la memoria privada de ese agente. Se pierde con `/clear`, con una sesión nueva o al cambiar de agente, y la persona no lo ve. Además, dos sesiones pueden tomar el mismo trabajo sin saberlo: el 2026-10-30 dos sesiones empezaron el mismo cambio con minutos de diferencia, y Specty solo lo notó al proponer, como «archivos compartidos».

Con esta épica, Specty tiene memoria propia, compartida por todas las sesiones y todos los agentes del clon:
- en vivo: qué sesiones trabajan, en qué carpeta, qué cambio lleva cada una y cuándo dio su último paso;
- duradera: los pendientes, las mejoras, los recordatorios y las decisiones de la persona, en una rama propia que todas las carpetas ven al instante.

Con ella, Specty decide los casos claros (el mismo pendiente, el mismo cambio de origen, la mitad de los archivos) y lleva los dudosos a la persona. Un modelo nunca decide solo.

## Fuera de alcance

- Lo que va después de esta épica, en este orden: (1) lecciones por ruta en la tarjeta de la tarea, y decisiones por ruta en la del borrador; (2) una sola verificación completa a la vez entre sesiones; (3) mensajes entre sesiones de cualquier agente; (4) que lo aplazado entre solo en la memoria: riesgos aceptados, deuda de `check --all` y hallazgos de `review`; (5) recordatorios con disparador; (6) carriles; (7) un panel de sesiones en la UI, con su consumo; (8) recursos de desarrollo: puertos por carpeta y recompilar tras cada cierre.
- Subir la rama de la memoria al remoto por su cuenta y compartirla entre clones o personas: la persona la sube cuando quiera, y automatizarlo va con el modo equipo.
- Reordenar las entradas: se listan por fecha.
- Que un modelo decida si dos trabajos son el mismo.

## Supuestos

- A1: La memoria duradera vive en una rama propia, `specty-memory`, sin historia común con el código: nadie la abre en una carpeta, Specty escribe en ella con sus propios commits y todas las carpetas del clon la ven al instante (decisión de la persona del 2026-10-30). Se llama en inglés, como `.specty/changes`, porque la usan proyectos en cualquier idioma.
  - impacto: alto
- A2: Descartar una entrada es solo de la persona y nunca se delega, como desbloquear un test (decisión de la persona del 2026-10-30). Cuando un agente lo pide, la entrada queda propuesta para descartar.
  - impacto: alto
- A3: Specty decide solo los casos claros: una entrada que ya tomó otro cambio, el mismo cambio de origen (`follows`) o la mitad de los archivos gobernados. Los dudosos, como un título parecido, los decide la persona, y ningún modelo decide solo.
  - impacto: alto
- A4: Una sesión se reconoce por su agente y su conversación, que llegan en los eventos de sus hooks. El guard anota su carpeta y su último paso como mucho una vez por minuto, para no frenar cada llamada.
- A5: Un cambio lo lleva la sesión vista en su carpeta, y queda huérfano si ninguna da un paso allí en 60 minutos (`memory.orphanAfterMin`).
- A6: Dos títulos se parecen si comparten al menos la mitad de las palabras significativas del más corto, sin las palabras vacías del español y del inglés y comparando raíces simples.
- A7: Cada entrada es un archivo markdown con su estado en el frontmatter, y la rama lleva un índice que Specty regenera, así que GitHub la muestra legible si se sube. Los ids son `P` para pendientes, mejoras y recordatorios, y `D` para decisiones, distintos de los de una spec.
- A8: La red del fin de turno solo existe en los agentes cuyo evento de fin de turno deja leer el último mensaje, y la tarjeta de inicio, en los que tienen ese evento; sus cortes comprueban en cuáles.

## Criterios de aceptación

- AC1: CUANDO una sesión de un agente con hooks trabaja en la carpeta de un cambio ENTONCES `specty status` dice qué agente lleva ese cambio y cuándo dio su último paso, y marca como huérfano el cambio cuya carpeta lleva más de `memory.orphanAfterMin` minutos sin ninguna sesión.
- AC2: CUANDO un agente o la persona ejecuta `specty memory add "<texto>"` desde cualquier carpeta del clon ENTONCES la entrada queda en `specty-memory` con un id nuevo, su tipo (`pending` por defecto, `improvement`, `reminder` o `decision`), su origen (el cambio y el agente) y la fecha, y `specty memory` la lista en ese mismo momento desde cualquier otra carpeta.
- AC3: CUANDO se cierra un cambio cuyo cierre tiene «Pendientes» ENTONCES cada uno pasa a ser una entrada abierta con ese cambio como origen.
- AC4: CUANDO una sesión recibe la tarjeta de inicio (al empezar, tras `/clear` o tras compactar) o el agente ejecuta `specty next` sin cambio activo ENTONCES la tarjeta dice cuántas entradas abiertas hay, muestra las tres primeras libres y los recordatorios, y explica cómo tomar una.
- AC5: CUANDO el agente crea un cambio con `specty new --resolves <id>` ENTONCES la entrada queda tomada por ese cambio y la muestra su borrador; si otro cambio abierto ya la tomó, `new` no crea nada y dice cuál, quién lo lleva y cuál es la siguiente libre; y al cerrarse el cambio, la entrada queda hecha.
- AC6: CUANDO un agente ejecuta `specty memory drop <id>`, también en modo delegado ENTONCES la entrada no se descarta: queda propuesta para descartar, con su motivo, en «TE TOCA» de `specty status`, y solo la persona la descarta, desde su terminal o desde `specty ui`.
- AC7: CUANDO se anota una decisión ENTONCES lleva la cita literal de la persona (`--quote`), y sin ella Specty no la anota; y un recordatorio sale en la tarjeta de inicio y en «TE TOCA» hasta que alguien lo marca hecho con `specty memory done <id>`.
- AC8: CUANDO se crea un cambio cuyo título o petición se parece al de un cambio abierto en otra carpeta, o que sigue al mismo cambio que otro abierto ENTONCES `new` no lo crea: dice cuál es, quién lo lleva y en qué fase, y pide preguntar al usuario; con `--distinct-from <id>` lo crea y lo anota en el audit.
- AC9: CUANDO la spec que se propone comparte al menos la mitad de sus archivos gobernados con otro cambio abierto ENTONCES `propose` avisa de un posible duplicado y, en modo delegado, su SIGUIENTE pide la decisión a la persona en lugar de aprobar.
- AC10: CUANDO el agente termina su turno con una lista de pendientes sin ids de la memoria en su último mensaje ENTONCES el hook de fin de turno le devuelve el turno una sola vez para que los anote o diga que no quedan.
- AC11: CUANDO el agente anota `specty note "<texto>"` durante un cambio ENTONCES la nota queda en el audit del cambio, y la tarjeta de inicio de una sesión en su carpeta muestra las últimas.
- AC12: CUANDO la persona abre `specty ui` ENTONCES ve las entradas de la memoria con su estado y su origen, quién lleva cada cambio y lo que le toca, y, si arrancó `specty ui` desde su terminal, puede descartar una entrada.

## Diseño

- Registro en vivo, local y nunca versionado: `.git/common/specty/sessions/<agente>-<conversación>.json`, con la carpeta, el cambio, el modelo si se sabe, y el primer y el último paso.
  - Lo escribe el guard en cada evento, si el último paso anotado tiene más de un minuto.
  - Lo leen `status`, `new`, `propose` y el servidor local.
- Memoria duradera: la rama `specty-memory` (`memory.branch`).
  - Specty la escribe con la fontanería de git (`hash-object`, `mktree`, `commit-tree` y `update-ref` con el valor anterior), bajo un lock, y reintenta si otra sesión escribió antes. Nunca la saca a una carpeta, y el guard no deja a los agentes escribirla con git.
  - Un archivo por entrada, `entries/P12.md`. El frontmatter lleva el id, el tipo, el estado (`open`, `taken`, `done`, `drop-proposed` o `dropped`), el origen, el cambio que la tomó y quién la hizo o la descartó y por qué. El cuerpo es el texto, escrito para alguien sin el contexto de la conversación.
  - `README.md` es el índice de las entradas abiertas, por tipo.
  - Cada operación es un commit con los trailers de los commits de Specty.
- Comandos:
  - `specty memory` lista las entradas abiertas; con `--all`, también las hechas y las descartadas.
  - `specty memory add "<texto>" [--kind …] [--quote "<cita>"]` avisa si el texto se parece al de una entrada abierta.
  - `specty memory done <id>` es solo para recordatorios: los pendientes y las mejoras se hacen al cerrar el cambio que los toma.
  - Con `specty memory drop <id> --reason "<motivo>"`, la persona descarta; un agente, también en modo delegado, solo propone.
  - `specty new` gana `--resolves <id>…` y `--distinct-from <id>`.
  - `specty note "<texto>"` anota `change.noted` en el audit del cambio activo.
- Tarjetas:
  - la de inicio de sesión y la de `next` sin cambio: los pendientes libres y los recordatorios;
  - `status`: quién lleva cada cambio, los huérfanos y «TE TOCA»;
  - el borrador: las entradas que resuelve el cambio;
  - una línea del bloque de flujo de AGENTS.md: anotar lo pendiente con `specty memory add` en vez de dejarlo solo en el chat.
- Documentación:
  - C1 lleva un ADR nuevo, el 0016. Recoge estas decisiones y enmienda ARCHITECTURE §9, que dice que no existe un archivo de estado global: el estado común vive fuera de las ramas del código.
  - `docs/formats.md` define la rama, las entradas, el registro, `memory` en `config.yaml` y los eventos nuevos.
  - El glosario gana «memoria», «entrada» y «sesión huérfana».

## Cortes

- C1: Specty sabe qué sesión lleva cada cambio y cuáles quedan huérfanos
  - ac: AC1
- C2: Lo pendiente se anota en la memoria de Specty y se ve al empezar cada sesión
  - ac: AC2, AC4, AC7
- C3: Los pendientes se toman, se cierran con su cambio y solo la persona los descarta
  - ac: AC3, AC5, AC6
  - depends: C2
- C4: Specty frena el trabajo duplicado al crear y al proponer un cambio
  - ac: AC8, AC9
  - depends: C1
- C5: El agente no termina su turno con pendientes sin anotar
  - ac: AC10
  - depends: C2
- C6: La bitácora del cambio llega a la sesión que lo retoma
  - ac: AC11
- C7: La memoria y las sesiones en la UI
  - ac: AC12
  - depends: C1, C3

## Riesgos

- R1: Varias sesiones escriben a la vez en la rama — `update-ref` con el valor anterior y un lock: la segunda reintenta sobre lo nuevo, y C2 lo prueba con escrituras simultáneas.
- R2: La memoria se llena de ruido — `memory add` avisa de una entrada parecida, la tarjeta pide textos autocontenidos y la persona descarta.
- R3: El registro de sesiones frena al guard — una escritura por sesión y minuto como mucho, y C1 mide el p95 antes y después.
- R4: Un falso parecido detiene un `new` legítimo — cuesta una pregunta a la persona, y `--distinct-from` deja constancia.
- R5: La rama solo vive en este clon hasta que se sube — la persona la sube cuando quiera; sin subirla, un disco perdido se la lleva, como hoy a la memoria del agente.
- R6: Algún corte no cabe en un cambio de tamaño L — se parte en cambios previos, cada uno con su test, como en épicas anteriores.
