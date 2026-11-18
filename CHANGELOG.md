# Historial de cambios

Todas las versiones se publican en [Releases](https://github.com/javierroman94/Nova-PX-Event-Launcher/releases).

## 1.0.74
- Permisos rediseñado: tarjetas de personas con cabeza 3D y rol, estadísticas, vista previa del nick al escribir, pasos de invitación en línea de tiempo y confirmación al quitar permiso.
- Paneles de administración: interruptores en lugar de casillas y listas de noticias/recomendados con más espacio.
- Barra superior compacta estilo Modrinth: título en línea, botón de descargas con progreso, estado del juego siempre visible.

## 1.0.73
- Pantalla de inicio rediseñada: portada con brillo y fondo de color, icono del modpack grande con efecto, botón Jugar con destello, secciones con acento, tarjetas de "Continuar" en dos columnas y noticias/amigos más cuidados.

## 1.0.72
- Paneles de administración rediseñados: pestañas con iconos, tarjetas con encabezado e icono, campos y botones más cuidados, barras de acciones fijas.
- Homenaje: sin líneas, tarjeta más limpia; ahora sirve también para quien tuvo que dejar el proyecto (💛 Siempre parte de Nova).

## 1.0.71
- Actualizar mods: ahora es un cuadro con una fila por mod (icono, nombre, versión vieja → nueva) y casillas para elegir cuáles actualizar, con «Marcar todos» y «Quitar todos». Antes era un texto largo con nombres de archivo.

## 1.0.70
- Clic derecho en mundos: duplicar y eliminar (antes de eliminar se guarda un respaldo), y «Activar/Desactivar todo» en el contenido. Solo funcionan en los modpacks que crea el usuario (perfil propio, copia o importado), nunca en los de Modrinth ni en los de eventos; el launcher lo comprueba también por dentro.
- La biblioteca nunca muestra instancias protegidas de eventos.

## 1.0.69
- Clic derecho en todo el launcher: biblioteca de modpacks (jugar, abrir, carpeta, duplicar, exportar, fijar arriba, ocultar, eliminar; en el fondo: nuevo perfil, importar, mostrar ocultos), mods/shaders/texturas (activar o desactivar, copiar nombre, quitar; en el fondo: cargar, explorar, activar o desactivar todo), mundos, skins guardadas y eventos del administrador (editar, duplicar, eliminar).
- Detalle del modpack rediseñado: cabecera con banner difuminado de su icono, fichas (versión, loader, origen, último juego, cuántos mods/shaders/texturas y peso), pestañas subrayadas, etiquetas de tipo y de desactivado, y ajustes en tarjetas con barra de acciones fija.
- Skins: la fila de capas ya no se sale de la tarjeta al ocultarla.

## 1.0.68
- Amigos con solicitudes: envías una solicitud por nick y la otra persona la acepta o rechaza; solo entonces ven el estado del otro.
- Estado en línea arreglado: ahora se guarda en el servidor (antes se perdía al reiniciarse y salía "Desconectado"); también muestra "Activo hace…". El latido es cada minuto y también al iniciar sesión.
- Chat entre amigos: botón 💬 con aviso de mensajes nuevos y ventana de conversación.
- Cada instalación usa un token secreto para que nadie pueda hacerse pasar por tu nick. Los amigos guardados antes se convierten en solicitudes automáticamente.
- Cabezas de jugadores en 3D (ganadores del historial, administración y amigos) y "Comisionado por" muestra la cabeza 3D de su nick a la derecha (campo nuevo en el editor de eventos).

## 1.0.67
- Historial rediseñado: las imágenes ahora rellenan la tarjeta (fondo difuminado, sin barras negras), evento destacado, estadísticas, filtro por año y tarjetas con hover.
- Administración › Eventos: tarjetas con portada, ganadores y avisos, búsqueda y botón de evento nuevo.

## 1.0.66
- **Perfil del Equipo rediseñado**: al pulsar a alguien se abre una tarjeta con banner (con su foto difuminada), foto con aro de color, nombre, @nick, rol, presentación en cita, enlaces como botones con su icono y botón «Copiar nick». Los destacados llevan aro dorado y los homenajes un diseño propio.
- **Equipo en Administración rediseñado**: cada persona es una tarjeta plegable con su foto, rol y etiquetas; al abrirla se edita por secciones (datos, presentación con contador, foto con vista previa, skin, enlaces, etiquetas). A la derecha, una vista previa en vivo de cómo se verá su perfil. Buscador, contadores, botones ↑↓ y arrastrar para ordenar (el arrastre no funcionaba antes).
- Al abrir la pestaña Equipo se vuelve a pedir lo publicado, para ver al instante los cambios que hizo otra persona del equipo.

## 1.0.65
- **Idiomas con banderas**: el selector de Ajustes → Idioma ahora son tarjetas con la bandera de cada país. Nuevos idiomas: Português, Français, Deutsch, Italiano, Русский y 日本語 (además de Español y English). Las banderas son dibujos propios, así se ven bien también en Windows. Lo que aún no esté traducido sigue saliendo en español.
- **Ajustes rediseñado**: cabecera con tu perfil y resumen (memoria, Java, idioma y tema) con atajos, cada sección con su icono y descripción, interruptores en lugar de casillas, atajos de memoria (2/4/6/8 GB) y de resolución de ventana, y una barra de guardado fija que avisa de los cambios sin guardar.

## 1.0.64
- **10 temas nuevos** de lo que está en tendencia: Catppuccin, Tokyo Night, Dracula, Rosé Pine, Synthwave, Cyberpunk, Sakura (claro), Deep Dark, Nether y The End. Cada uno trae su paleta, su fondo y su color principal propio (puedes cambiar el color después).
- Los administradores también pueden poner cualquiera de ellos como tema por defecto de todos los jugadores.
- Arreglo: en los temas claros el botón «Próximo evento» del bloque de Inicio se leía mal.

## 1.0.63
- **Inicio**: el bloque grande ahora es de tu modpack reciente (su imagen, nombre, última partida y JUGAR). El evento ya no tapa tu modpack: en «Continuar» va después de tus modpacks, salvo que esté activo.
- **Skins**: la fila de capas ya no se sale de la pantalla por la derecha.
- **Admin**: «Editar evento» ordenado en tarjetas (datos, resultado, comisionado, enlaces, personas) con botones siempre visibles; los miembros del equipo ahora son tarjetas con avatar, roles y opciones tipo etiqueta.

## 1.0.62
- **Crear instancia rediseñado como asistente**: tarjetas por tipo de perfil (Nova, Fabric, Forge, OptiFine, Vanilla) con descripción, buscador y lista de todas las versiones, iconos rápidos, vista previa en la cabecera y resumen con la versión de Java. Los tipos que no funcionan en esa versión (Fabric/Nova antes de 1.14) se bloquean solos. Si no escribes nombre, se pone uno automático.

## 1.0.61
- **Fechas de temporadas corregidas** (calendario de Ecuador): San Valentín 7–14 feb, Carnaval (se calcula cada año según la Pascua), Día de la Madre (semana del 2.º domingo de mayo), 10 de Agosto 1–10 ago, Halloween 15 oct–2 nov, Navidad 1–26 dic, Año Nuevo 27 dic–6 ene. Fuera de esas fechas no hay decoración (antes la Navidad empezaba el 1 de noviembre).
- Arreglo: una marca de conflicto de git olvidada en los estilos hacía que la imagen de la instancia en Admin saliera enorme y tapara el texto.
- Inicio: el arte del evento se ve completo y el botón JUGAR pasa abajo a la izquierda.

## 1.0.60
- Los perfiles **Nova** ahora instalan también **Nova Client** (mod propio, repo javierroman94/Nova-Client): menú en el juego con Shift derecho y módulos FPS, CPS, coordenadas, teclas, armadura y zoom (tecla C). Por ahora solo para Minecraft 1.21.1.

## 1.0.59
- Pantalla de carga animada: órbitas, halo giratorio, partículas, barra con flujo de color y mensajes de estado.
- Crear instancia: nuevo perfil **Nova** (Fabric + Sodium, Lithium, FerriteCore, ModernFix, Entity Culling, ScalableLux, Iris… basado en packs optimizados como Keo Optimized), opción **OptiFine** (perfil Forge + .jar oficial que añade el jugador) y casilla para ver también snapshots.

## 1.0.58
- **Discord y X desde Admin → Control**: guarda el webhook de tu canal de Discord (cifrado, nunca se muestra) y el launcher puede avisar solo cuando publiques una noticia nueva o cambies/publiques el evento. También hay un mensaje manual y el botón "Compartir en X", que abre X con el texto listo (sin claves de API ni costo).
- Los avisos no mencionan a @everyone ni a roles aunque el texto lo lleve.

## 1.0.57
- **Explorar como Modrinth**: pestañas Modpacks, Mods, Texturas y Shaders. En las tres últimas pulsas "Instalar en…", eliges la instancia y se instala la versión compatible (con sus dependencias).
- **Skins**: ya no falla si Mojang devuelve las capas incompletas, y el aviso de cuenta no premium tiene su espacio.
- **Admin**: el campo de enlace del anuncio tiene el mismo estilo que los demás, las tarjetas de Control ya no se pegan y las casillas del equipo muestran su texto (Destacado, Homenaje).

## 1.0.56
- **Amigos y estado en línea**: en Inicio añade el nick de un amigo y verás si está en línea, jugando o desconectado. La lista se guarda solo en tu equipo. Aparecer en línea usa el mismo permiso de "Compartir uso" de Ajustes; si lo apagas, no apareces.
- El Worker de Cloudflare ahora incluye el servicio de estado (en memoria, sin gastar escrituras de KV).
- Todavía no hay chat: requiere moderación y lo dejamos para después.

## 1.0.55
- **Explorar con filtros** (como el Centro de contenido): loader (Fabric, Forge, NeoForge, Quilt), versión del juego y orden (descargas, seguidores, nuevos, actualizados).
- **Pantalla de entrada** en dos columnas con las ventajas del launcher, botón de Microsoft y opción sin premium.
- **Barra lateral compacta** (solo iconos) con botón en la parte baja; se recuerda tu elección.
- Arreglado el icono del modpack que se encimaba en Admin y un buscador de Ajustes duplicado.

## 1.0.54
- **Inicio rediseñado (Launchpad)**: saludo con tu nombre, contador de jugadores en línea, portada grande con el banner del evento entero y botón JUGAR para tu último modpack.
- Las novedades ahora se muestran como tarjetas con imagen.

## 1.0.53
- **Imágenes de eventos completas**: el banner de Inicio, las noticias y las imágenes de eventos ya no se recortan (se ven enteras, con fondo difuminado).
- **Nuevo perfil**: asistente con cuatro opciones (Asistente, Instalar modpack, Importar archivo, Desde otros launchers) y buscador, inspirado en Lunar.
- **Versiones populares** en forma de cuadrícula al crear una instancia.
- **Buscador en Ajustes** para encontrar rápido cada opción.

## 1.0.52
- **Más rápido**: los datos del evento se descargan una sola vez al abrir (antes se repetían), con espera máxima de 4 s si GitHub tarda; la lista de mods se muestra al instante cuando no cambió.
- **Estado del evento**: en Admin hay botones Próximamente / Activo / Finalizado que cambian el estado al momento, sin volver a subir los mods.
- **Contador de la comunidad** en Inicio (jugadores activos hoy y total), con cifras públicas sin nombres.
- Incluye la dirección del contador de Cloudflare para que empiece a registrar usuarios.

## 1.0.50
- **Skins que no cargaban**: si Mojang limita o falla, el launcher reintenta y usa servicios alternos; un fallo ya no se recuerda 10 minutos.
- **Finalizar evento**: botón "Finalizar evento" en el panel de administración (publica el evento como finalizado de un clic).
- **Evento**: se quitó "Ver mods del evento". Nuevo apartado de **patrocinadores y créditos** ("Servidor hospedado por…", "Evento creado por…") con nombre, enlace, logo y texto; se edita desde Admin y, sin datos, muestra un espacio "Tu marca aquí".

## 1.0.49
Correcciones del tablero de pruebas:
- **Equipo**: al hacer clic en una persona ya no se congela la pantalla (la ventana de información estaba dentro de una pestaña oculta).
- **Eventos**: al publicar, el administrador elige el estado (Próximamente, Activo o Finalizado) y puede subir el banner y el logo del evento; Inicio los muestra y marca "Evento finalizado" cuando corresponde.
- **Skins guardadas**: cada skin se ve con el cuerpo completo en 3D (girable), con su capa si se guardó con una, su nombre editable y botón Usar.

## 1.0.48
Cambios pedidos desde el tablero de pruebas:
- **Eventos**: los ganadores salen solo como cabezas en una fila horizontal; nuevo recuadro "Comisionado por…" (va primero y abre el canal de quien comisionó); botones de tráiler, tweet o póster; fondo propio para la publicación del evento. Los colaboradores se ven en pequeño.
- **Skins**: la capa se guarda junto con la skin y se vuelve a poner al usarla; puedes ponerle nombre a cada skin al guardarla y cambiarlo después (clic en el nombre); las capas se muestran en una fila plegada con una flecha para desplegarlas todas.

## 1.0.47
- **Skins**: el visor 3D ya no se anima, solo gira con el mouse. La skin que tienes puesta en tu cuenta premium se guarda sola en tu lista (Mojang no da el pasado, así que el historial se arma desde ahora).
- **Sin premium, sin Steve**: eliges una skin local que se ve en el launcher y, en Fabric y Forge, dentro del juego mediante el mod CustomSkinLoader (solo la ve quien la usa). El administrador también puede subir una skin PNG para personas del Equipo y de los eventos que no tengan cuenta premium.
- **Comunidad**: logos reales de Discord, YouTube, X, Twitch, TikTok, Instagram, GitHub y Facebook; la web de Nova PX usa el logo del launcher.
- **Intro animada**: el logo aparece con anillos de luz y destello, y se cierra cuando el launcher termina de cargar. Se puede desactivar en Ajustes > Apariencia o saltar con un clic.
- **Más temporadas**: San Valentín, Carnaval, Día de la Madre y 10 de Agosto, con su decoración y un banner en Inicio.

## 1.0.46
- **Anuncios con imágenes y enlaces**: las noticias pueden llevar imagen y varios botones de enlace; la franja global puede llevar imagen y un texto propio en el botón. Se editan en el panel administrador.

## 1.0.45
Correcciones y mejoras pedidas en el tablero de pruebas:
- Inicio: las miniaturas de eventos ya no muestran ganadores (se ven al abrir el evento). Enlaces de la comunidad grandes, con icono y brillo.
- Se quitó la imagen de fondo personalizada. "Ver mods del evento" ahora es solo para administradores.
- Skins: nombres Default / Slim; elegir una capa ya no borra la skin cargada; **skins guardadas** con cambio de un clic.
- Modpacks: el filtro de tipo filtra de verdad y muestra un mensaje si no hay nada; confirmaciones con la estética del launcher; la descarga de texturas ya no deja el aviso colgado.
- Ventana: la barra superior sigue el estilo elegido (Windows). Los diálogos grandes tienen botón ✕. Signo "?" centrado. Sin la línea que cortaba la skin en Equipo.
- Equipo: clic en un miembro abre su **perfil** (foto, nombre, presentación y enlaces).
- Botones laterales del mouse: atrás y adelante.

## 1.0.44
- **Modo streamer**: oculta tu nick manualmente o automáticamente al detectar OBS, Streamlabs, etc.
- **Ajustes rediseñados** al estilo Discord (buscador, perfil, grupos).
- **Modpack del evento bloqueado**: se quitan mods/resourcepacks/shaders añadidos o modificados (se puede desactivar por evento).
- **Colaboradores de GitHub**: invita admins desde el panel para que sus cambios salgan con su nombre, sin compartir tu token.
- Los usuarios premium deben volver a iniciar sesión a los 30 días; los no premium quedan permanentes.
- **Equipo y eventos**: enlaces (redes/portafolio) por persona, participantes con nombre y colaboradores con skin y enlaces.

## 1.0.43
- Lo que publicas desde el panel (equipo, noticias, eventos, evento, configuración) se ve **al instante** en tu launcher.
- Todos los launchers abiertos se actualizan solos cada 3 minutos y al volver a la ventana, sin tener que reiniciarlos.

## 1.0.42
- **Homenaje en Equipo**: una persona puede marcarse como homenaje (🕊) en el panel administrador; aparece en una tarjeta grande y dorada arriba de todo, con su skin 3D, años y un mensaje.

## 1.0.41
- **Panel administrador ampliado**: nuevas secciones Apariencia, Ajustes, Control, Recomendados y Estado. Cambia nombre, tema, temporada, color, bienvenida, enlaces, RAM por defecto, anuncio global, mantenimiento, versión mínima y funciones sin reinstalar (`data/launcher.json`).
- **Más interactivo**: vista previa en vivo, arrastrar y soltar (equipo, noticias, eventos, recomendados), historial con restauración de versiones, botón Deshacer y borradores que se recuperan.

## 1.0.40
- Vuelve el launcher **Nova PX** (diseño, nombre y logo de la 1.0.34). Se retiran la marca Sagitta, las comunidades por código y la portada nueva.

## 1.0.34
- Nuevo diseño **Nova Neón** (futurista y animado) como tema por defecto.
- Decoración de temporada automática: Halloween, Navidad (nieve y luces) y Año Nuevo (confeti).
- Paquetes de idioma en Ajustes, con inglés incluido y carpeta para añadir más.

## 1.0.33
- Animación de inicio nueva: sobria y de menos de 2 segundos.
- Guía sobre el registro de una app de Microsoft (`docs/MICROSOFT.md`).

## 1.0.32
- Estado del servidor de cada modpack (activo y jugadores conectados) leyendo su `servers.dat`. La IP nunca se muestra.

## 1.0.31
- Los modpacks importados buscan su icono en Modrinth; se puede poner o quitar una imagen propia por instancia.

## 1.0.30
- Tarjeta de progreso global al importar, instalar o publicar. Las descargas se reintentan hasta 4 veces.

## 1.0.29
- El token de administrador se valida con una escritura real (los permisos que informa GitHub son los del usuario, no los del token).

## 1.0.28
- Asistente de primer uso: cuenta, RAM recomendada y resumen.

## 1.0.27
- Ajustes con menú lateral y temas Oscuro, Claro y OLED.
- Editor de eventos en el modo administrador, con imagen y ganadores con skin 3D.

## 1.0.26
- Diseño renovado: barra superior con historial, «Continuar jugando», recientes y biblioteca con orden, agrupación y filtros.

## 1.0.25
- Contador de usuarios opcional con Cloudflare Worker y pestaña Admin › Usuarios.

## 1.0.22 – 1.0.24
- Panel de administración en 3 pasos: publicar un evento con un botón (mods cifrados + manifest).
- El modo administrador solo aparece para cuentas premium autorizadas.
- Se quita CurseForge.

## 1.0.18 – 1.0.21
- Instancias propias, ajustes por modpack, duplicar, respaldos de mundos y actualización de mods.
- Importar de Prism/MultiMC, CurseForge App y Modrinth; exportar `.novapx`.
- Modpacks recomendados y pestaña de capturas.

## 1.0.1 – 1.0.17
- Sesión recordada, equipo con skins 3D, instancias por evento, Discord Rich Presence, consola con diagnóstico, historial de eventos y biblioteca de modpacks de Modrinth.
