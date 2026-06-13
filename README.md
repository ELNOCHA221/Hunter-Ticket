# Hunter Ticket - by BOTX

## ¿Qué es Hunter Ticket?

Hunter Ticket es una extensión de navegador que reclama tickets de Discord de forma automática. Escanea los canales del servidor, detecta tickets nuevos sin atender y los reclama por ti en cuestión de segundos.

## Origen del Proyecto

Esta herramienta nació de una necesidad real. Como staff en un servidor de Discord, los tickets entraban constantemente y otros miembros del equipo los reclamaban antes de que siquiera pudiera reaccionar. No importaba qué tan pendiente estuviera, siempre había alguien más rápido haciendo clic en el botón.

Ante esa situación, decidí buscar una solución por mi cuenta: automatizar el proceso de reclamo para no perder más tickets. Así nació **Hunter Ticket** — una herramienta pensada para que ningún ticket se te escape, sin importar cuántos staffs estén compitiendo por el mismo botón.

El objetivo principal siempre fue ese: **ser el primero en reclamar**, para que no te ganen el ticket.

## Instalación

1. Descarga o clona los archivos del proyecto en tu computadora.
2. Abre tu navegador y ve a `chrome://extensions/`.
3. Activa el **Modo de desarrollador** (esquina superior derecha).
4. Haz clic en **Cargar extensión sin empaquetar** y selecciona la carpeta del proyecto.
5. Listo. Abre Discord en el navegador y la extensión empezará a funcionar.

## Funciones Principales

###  Reclamo Automático de Tickets
La extensión detecta canales de tickets nuevos en el servidor y presiona el botón de reclamar automáticamente. Tú no tienes que hacer nada — ella se encarga.

###  Respuesta Automática
Después de reclamar un ticket, puede enviar un mensaje automático al canal (por ejemplo, un saludo o mensaje de bienvenida). Puedes activar o desactivar esta función y personalizar el mensaje desde la configuración.

###  Filtrado de Canales
La extensión busca canales que tengan nombres como `ticket-`, `soporte-`, `consulta-`, `denuncia-`, entre otros. Si tu servidor usa nombres diferentes, puedes agregar tus propios patrones personalizados.

###  Palabras Clave (Keywords)
Para saber qué botón presionar, la extensión busca palabras como "claim", "reclamar", "tomar", etc. en los botones del mensaje. También puedes agregar tus propias palabras clave si el bot de tickets de tu servidor usa un texto diferente.

### Delay (Tiempo de Espera)
Puedes configurar un rango de tiempo antes de que la extensión reclame el ticket. Por ejemplo, entre 0.5 y 2 segundos. Esto ayuda a que el comportamiento se vea más natural y no sea tan obvio que es automático.

### Whitelist (Lista de Servidores Permitidos)
Si estás en varios servidores de Discord, probablemente no quieras que la extensión reclame tickets en todos. Con la **whitelist** puedes elegir en qué servidores específicos quieres que funcione.

**¿Cómo se usa?** Solo necesitas pegar el ID del servidor donde quieres que Hunter Ticket trabaje. Si dejas la whitelist vacía, la extensión funcionará en todos los servidores donde tengas permisos de staff. Si agregas uno o más IDs, solo funcionará en esos servidores y los demás serán ignorados.

### Manejo de Modales
Algunos bots de tickets muestran un formulario emergente (modal) antes de completar el reclamo. La extensión puede llenar y enviar esos formularios automáticamente con un mensaje que tú configures.

###  Notificaciones por Webhook
Puedes conectar un webhook de Discord para recibir notificaciones cada vez que se reclame un ticket. También puedes generar reportes de actividad con estadísticas por servidor.

###  Overlay en Discord
Al entrar a Discord, aparece una pequeña ventana flotante que muestra el estado de la extensión, el conteo de tickets reclamados y un registro de actividad en tiempo real. Puedes minimizarla, cerrarla por completo, o reabrirla con el ícono flotante con este emoji🎯.

## Cosas Importantes que Debes Saber

**Hunter Ticket** funciona como un **Self-Bot**, lo que significa que usa tu propia cuenta de Discord para realizar acciones automáticas. Esto es algo que Discord **no permite** en sus reglas.

### ¿Qué riesgos tiene?

- **Pueden detectarte**: Discord analiza el comportamiento de las cuentas. Si tu cuenta hace cosas de forma muy mecánica o repetitiva, puede ser marcada.
- **Viola los Términos de Servicio**: Usar automatizaciones con tu cuenta personal va en contra de las reglas de Discord. Punto.
- **Consecuencias posibles**:
  - Suspensión temporal o permanente de tu cuenta.
  - Restricción de funciones (no poder enviar mensajes, entrar a servidores, etc.).
  - Baneo por IP en casos extremos.

### Disclaimer

> **Este proyecto es con fines educativos y de investigación.** Este proyecto es con fines educativos y de investigación.** El desarrollador de Hunter Ticket no se hace responsable de lo que hagas con esta herramienta. Si decides usarla, hazlo bajo tu propio riesgo. No se ofrecen garantías de funcionamiento, seguridad ni indetectabilidad.
> Al utilizar **Hunter Ticket**, aceptas que lo haces bajo tu propio riesgo y discreción.

## Diseño de Interfaz

La interfaz gráfica de la extensión (popup, overlay y estilos) fue diseñada con asistencia de inteligencia artificial, utilizada como herramienta de apoyo durante el proceso de desarrollo para acelerar la creación de componentes visuales y optimizar la experiencia de usuario.

## Soporte

- **Issues**: Si encuentras un error o quieres sugerir algo, abre un *issue* en el repositorio.
- **Pull Requests**: No se aceptan pull requests.
- **Contacto**: Actualmente no hay soporte disponible.

## Licencia

Este proyecto está bajo la licencia MIT. Consulta el archivo `LICENSE` para más detalles.

## Desarrollador principal

- BOTX
