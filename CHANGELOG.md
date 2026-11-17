# Historial de cambios

Todas las versiones se publican en [Releases](https://github.com/javierroman94/Nova-PX-Event-Launcher/releases).

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
