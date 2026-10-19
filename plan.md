# Plan de UniFlow

## Objetivo

UniFlow será un asistente académico móvil para iPhone. El usuario podrá capturar información de clase mediante texto, fotos, audios y documentos; la aplicación enviará el procesamiento pesado a la nube; y el resultado quedará organizado como notas, materias, tareas, fechas, recordatorios y sesiones de estudio.

La aplicación debe sentirse ligera en el teléfono: no descargará modelos de IA ni mantendrá archivos grandes localmente. El iPhone se encargará principalmente de capturar la entrada, mostrar la interfaz y entregar notificaciones; la nube se encargará de guardar, transcribir, analizar, buscar y planificar.

## Alcance funcional de la primera versión completa

1. **Cuenta y privacidad**
   - Inicio de sesión con la autenticación administrada de Manus.
   - Datos separados por usuario.
   - Archivos y registros con autorización en servidor.
   - Eliminación lógica de entradas y opción de exportación.

2. **Inicio / Hoy**
   - Resumen de tareas próximas, sesiones de estudio y recordatorios.
   - Indicador de progreso de la semana.
   - Acceso rápido a capturar texto, foto, audio o archivo.
   - Recomendación diaria breve basada principalmente en la complejidad, urgencia y cantidad de tareas; la disponibilidad del usuario solo se usará para evitar choques imposibles.

3. **Captura rápida**
   - Texto libre como: “Recordatorio: presentación de sociología el viernes”.
   - Foto del tablero, cuaderno o diapositiva.
   - Grabación de audio desde el iPhone.
   - Selección de documentos desde Archivos.
   - Bandeja de entrada para revisar y confirmar la clasificación sugerida.
   - El usuario podrá corregir materia, fecha, prioridad y tipo antes de guardar.

4. **Procesamiento inteligente en la nube**
   - Fotos y documentos se guardarán en almacenamiento de objetos administrado.
   - El servidor extraerá texto y datos accionables mediante los servicios de IA disponibles.
   - Audios se transcribirán en español y el texto quedará asociado al audio original.
   - Se detectarán materia, conceptos, fechas, tareas, exámenes, entregas y acciones.
   - La IA no creará tareas definitivas sin permitir revisión o corrección del usuario.

5. **Materias**
   - Crear, editar y archivar materias.
   - Vista por materia con notas, capturas, transcripciones, documentos, tareas y fechas.
   - Búsqueda por texto en el contenido procesado.

6. **Tareas y planificación**
   - Crear tareas manualmente o desde una captura procesada.
   - Fecha límite, prioridad, estado, materia, complejidad y duración estimada.
   - Dividir trabajos largos en pasos.
   - Calcular una carga de estudio según complejidad, urgencia, cantidad de tareas y cercanía de las fechas; la disponibilidad será una restricción secundaria, no el criterio principal.
   - Para una tarea sencilla y aislada, sugerir bloques cortos —por ejemplo, 15 minutos—; para una carga grande, aumentar automáticamente el tiempo diario —por ejemplo, hasta 90 minutos cuando existan muchas tareas acumuladas—.
   - Priorizar primero lo urgente y complejo, después lo cercano y finalmente lo de baja complejidad o mayor margen.
   - Dividir trabajos complejos en pasos y distribuirlos en sesiones progresivas hasta la fecha límite.
   - Reprogramar sesiones incompletas sin perder el historial, elevando la prioridad si el retraso pone en riesgo la entrega.
   - Vista semanal y lista de pendientes.

7. **Chat académico**
   - Conversación sobre las notas y tareas del usuario.
   - Preguntas como “¿qué tengo esta semana?”, “¿qué dijo el profesor del examen?” o “hazme preguntas sobre derivadas”.
   - Respuestas basadas primero en la información guardada del usuario.
   - Guardado del historial de conversaciones.
   - Acciones desde el chat: crear tarea, cambiar fecha, resumir una nota o generar plan.

8. **Recordatorios y calendario**
   - Recordatorios asociados a tareas, exámenes, entregas y sesiones.
   - Para un examen o entrega futura, crear una secuencia progresiva: aviso semanal cuando falte suficiente tiempo; al acercarse la fecha, varios avisos reforzados y como mínimo tres recordatorios antes del vencimiento, además del aviso del día cuando corresponda.
   - Ejemplo: para “examen el 17”, UniFlow puede recordar el evento con anticipación semanal y luego reforzarlo al acercarse, sin depender de que el usuario vuelva a escribirlo.
   - Cada recordatorio tendrá acciones rápidas como “Ya está hecho”, “Posponer” y “Ver plan”.
   - Si el usuario confirma “Ya está hecho”, se detienen los recordatorios de esa tarea o evento y se marca como completado.
   - Si pasa la fecha límite sin confirmación, se detiene la insistencia automática y el elemento queda marcado como vencido para revisión manual; no se seguirá notificando indefinidamente.
   - Notificaciones de iPhone cuando el sistema de notificaciones esté disponible para el entorno de ejecución.
   - Vista de fechas dentro de UniFlow.
   - Exportación de tareas y sesiones en formato de calendario compatible con Apple Calendar.
   - Endpoint programado en la nube para revisar recordatorios próximos y mantener el estado actualizado.

9. **iCloud / Drive / WhatsApp**
   - En iPhone, exportación a Archivos permite guardar copias en iCloud Drive sin almacenar todo en el teléfono.
   - Exportación de notas, tareas y calendario en formatos portables.
   - Google Drive y WhatsApp se dejarán como integraciones configurables posteriores porque requieren permisos y credenciales externas; la aplicación no dependerá de ellas para funcionar.
   - La experiencia principal será el chat y la captura dentro de UniFlow, evitando depender de WhatsApp para el MVP.

## Arquitectura técnica

- **Cliente:** starter administrado Expo / React Native / TypeScript, optimizado para iPhone y uso con una mano.
- **Servidor:** Express + tRPC existente en el starter.
- **Datos:** MySQL administrado con Drizzle.
- **Archivos:** almacenamiento de objetos administrado; la base de datos conservará índices, propietarios, tipo, estado y URL estable.
- **IA:** API de IA administrada para chat, extracción estructurada, resúmenes y planificación.
- **Audio:** servicio de transcripción administrado; se conservarán texto, idioma y segmentos.
- **Sesiones:** autenticación Manus OAuth y autorización por usuario.
- **Notificaciones:** capa de recordatorios preparada para notificaciones locales/push; la entrega push de producción puede requerir credenciales de Apple/Expo y una compilación nativa.
- **Nube:** backend, base de datos, almacenamiento y procesamiento en la infraestructura administrada de Manus.

## Modelo de datos principal

- `users`: identidad y perfil.
- `subjects`: materias del usuario.
- `inbox_entries`: capturas originales y estado de procesamiento.
- `attachments`: fotos, audios y documentos con sus claves de almacenamiento.
- `transcripts`: transcripciones y segmentos de audio.
- `notes`: notas procesadas y contenido indexable.
- `tasks`: tareas, fechas, prioridad, complejidad, urgencia, estado y duración.
- `task_steps`: pasos de trabajos largos.
- `study_sessions`: sesiones planificadas y completadas.
- `reminders`: secuencias de recordatorios, número de intento, fecha programada, estado y acción del usuario.
- `calendar_events`: eventos académicos y exportación.
- `chat_threads` y `chat_messages`: conversaciones y respuestas.

Todas las tablas de negocio incluirán `userId` y las consultas del servidor verificarán pertenencia antes de leer o modificar registros.

## Experiencia de navegación

- **Inicio:** resumen de hoy y captura rápida.
- **Capturar:** selector de texto, foto, audio y archivo.
- **Tareas:** pendientes, calendario y plan semanal.
- **Chat:** conversación con el asistente.
- **Materias:** contenido organizado por clase.
- **Ajustes:** disponibilidad semanal, preferencias de recordatorios, exportación y privacidad.

## Diseño

### Tres direcciones consideradas

- **Cuaderno editorial sereno** — 0.06: una interfaz cálida que combina notas manuscritas, márgenes y jerarquía editorial.
- **Panel académico operativo** — 0.08: una interfaz compacta y de alto contraste que prioriza tareas, fechas y acciones inmediatas.
- **Jardín de progreso** — 0.04: una interfaz más expresiva que usa hitos suaves para representar el avance del semestre.

### Dirección elegida: Cuaderno editorial sereno

- **Movimiento de diseño:** editorial minimalista contemporáneo, inspirado en cuadernos de estudio y papelería universitaria, no en un dashboard empresarial.
- **Principios:** captura sin fricción, lectura descansada, jerarquía clara y sensación de avance sin presión.
- **Filosofía de color:** marfil y tinta profunda para reducir fatiga visual; verde salvia como color propio para acciones de avance; amarillo tenue solo para fechas importantes.
- **Paradigma de layout:** flujo vertical de “hoy” con tarjetas apiladas y una bandeja de captura flotante; evitar una cuadrícula rígida.
- **Elementos distintivos:** línea lateral de progreso en tareas, pequeñas etiquetas de materia tipo ficha y botón circular de captura rápida.
- **Interacción:** cada captura debe poder iniciarse con un toque; las confirmaciones se presentan como una revisión amable, no como formularios largos.
- **Animación:** transiciones cortas y discretas; las tareas completadas se deslizan y la planificación aparece por bloques, sin animaciones decorativas pesadas.
- **Tipografía:** una sans-serif legible para controles y una serif editorial moderada para títulos de sección, siempre con tamaños cómodos en iPhone.
- **Esencia:** “Todo lo que pasa en clase, convertido en el siguiente paso”; para estudiantes que quieren orden sin convertir su semestre en una hoja de cálculo. Personalidad: serena, práctica y atenta.
- **Voz:** directa, cálida y concreta. Ejemplos: “Captura ahora; lo ordenamos después.” y “Hoy solo necesitas avanzar en este paso.”
- **Marca:** wordmark UniFlow con una “U” construida como una página doblada que continúa en una línea de flujo.
- **Color de marca:** verde salvia profundo, utilizado en botones principales, progreso y estados positivos.

## Flujo de construcción

1. Actualizar el starter con navegación y sistema visual de UniFlow.
2. Configurar diagnóstico TypeScript y ejecutar la migración inicial de base de datos.
3. Ampliar el esquema Drizzle y crear procedimientos tRPC con autorización por usuario.
4. Implementar materias, bandeja de entrada, tareas, sesiones y recordatorios.
5. Implementar carga segura de archivos y persistencia de metadatos.
6. Implementar transcripción de audio y extracción estructurada de fotos/documentos.
7. Implementar chat contextual y acciones estructuradas desde el chat.
8. Implementar el motor de prioridad y carga: puntuar complejidad, urgencia, cercanía, cantidad de trabajo y pasos restantes; convertir esa puntuación en sesiones diarias y bloques de estudio.
9. Implementar el motor de recordatorios progresivos, las acciones “Ya está hecho” y “Posponer”, el cierre automático al vencer y el endpoint programado en la nube.
10. Implementar calendario, exportación a Apple Calendar/Archivos y preferencias de disponibilidad como restricción secundaria.
11. Integrar la capa de notificaciones disponible y dejar documentado el requisito de credenciales nativas de Apple/Expo si se habilita push real.
12. Crear iconos/branding nativo, revisar los flujos principales en Preview móvil y ejecutar las comprobaciones TypeScript/lint.
13. Guardar un checkpoint con los cambios aceptados; la publicación final quedará separada del checkpoint.

## Límites y decisiones explícitas

- El teléfono no será la fuente principal de datos: la nube será la fuente de verdad.
- iCloud Drive se abordará inicialmente mediante exportación desde Archivos; una integración privada de CloudKit requiere configuración de Apple y no debe fingirse como una API web genérica.
- WhatsApp no será un requisito del funcionamiento central; se podrá añadir mediante una integración autorizada después.
- La IA propondrá clasificaciones y planes, pero el usuario conservará la confirmación final sobre fechas y tareas.
- La regla de planificación será complejidad + urgencia + carga acumulada: la disponibilidad del usuario servirá para ajustar conflictos, no para decidir por sí sola cuánto estudio necesita.
- Los recordatorios serán insistentes pero finitos: como mínimo tres avisos antes de un examen o entrega cuando exista tiempo suficiente; se detendrán con “Ya está hecho” o al pasar la fecha límite.
- No se incluirán modelos grandes ni bases vectoriales pesadas en el iPhone.
