# Historial de cambios

Todas las versiones se publican en [Releases](https://github.com/javierroman94/Nova-PX-Event-Launcher/releases).

## 1.0.147
- **Panel lateral de Versiones al estilo Lunar**: arriba la imagen, el título y la descripción (con «Leer más»); abajo, siempre a la vista, la versión, los loaders como iconos (el nombre sale al pasar el mouse), el estado de tu perfil y una fila con ajustes y el botón grande de jugar.

## 1.0.146
- **NeoForge 1.21.11 y 26.x**: usan el instalador oficial y se lanzan como versión propia, con los argumentos de Java que trae NeoForge (antes fallaban con `NoClassDefFoundError: cpw/mods/modlauncher/Launcher`). Forge y NeoForge dejan en la consola una línea `[Nova]` que dice qué motor se usó.

## 1.0.145
- **Actualizaciones más rápidas y automáticas**: el launcher busca nuevas versiones al abrirse, cada 10 minutos (antes 30) y cada vez que vuelves a su ventana. Si hay una, la descarga sola y te avisa con el botón de arriba; ya no hace falta buscarla a mano.

## 1.0.144
- **Forge 1.21.11 y los Forge nuevos (61.x)**: ya no usan el motor que fallaba con `NoClassDefFoundError: cpw/mods/modlauncher/Launcher`. Ahora se instalan con el instalador oficial de Forge (la primera vez tarda unos minutos) y se lanzan como versión propia.
- **Minecraft muy viejo (1.10 y anteriores, snapshots viejos)**: si `options.txt` traía un idioma moderno (como `es_ec`), el juego se cerraba con un NullPointerException; ahora se cambia a `en_US` antes de iniciar.
- Portada original de Nova Client para los perfiles Nova.
- **Pantalla de carga y panel de juego para Nova Client**: al abrir un perfil Nova aparece una pantalla completa con fondo borroso, logo, estado y barra de progreso; al arrancar Minecraft pasa sola a un panel con la consola en vivo, los datos de la instancia, el tiempo de sesión y promos propias (Discord, evento, novedades). Se oculta con Ocultar o Esc y se puede desactivar en el propio panel.

## 1.0.143
- **Portadas por defecto en tus perfiles**: los perfiles que creas (Vanilla, Fabric, Quilt, NeoForge…) sin imagen propia ahora usan la imagen oficial de su versión de Minecraft, igual que en Versiones; los snapshots usan la de su versión final. Los modpacks siguen con su propia imagen. Los perfiles **Nova** (con Nova Client) estrenan una portada original propia.

## 1.0.142
- **Tema nuevo: Vice Sunset** (Ajustes → Apariencia): atardecer neón en rosa, naranja, morado y turquesa, con sol y palmeras de fondo, cursor propio, estela de chispas y sonidos de sintetizador retro al pasar el cursor (se apagan en Ajustes).

## 1.0.141
- **Quilt ya se puede jugar**: antes el launcher decía «el loader quilt todavía no está soportado» al pulsar Jugar. Ahora prepara Quilt y abre el juego.

## 1.0.140
- **La ventana de novedades ya no sale encima de la intro**: aparece cuando termina la animación de inicio.
- **Botones de la ventana durante la intro**: minimizar, maximizar y cerrar se ven sobre el fondo blanco y vuelven a los colores del tema al terminar.

## 1.0.139
- **CurseForge en Explorar modpacks**: ya puedes buscar e instalar modpacks de CurseForge desde el launcher (junto a Modrinth y FTB). Los mods cuyo autor bloquea las descargas externas se avisan y se omiten.

## 1.0.138
- **Mods que chocan en Fabric**: si el juego no abre porque dos mods no son compatibles (por ejemplo Sodium e Iris tras una actualización), el aviso ahora dice cuáles son y qué hacer.

## 1.0.137
- **Forge 1.12.2 (RLCraft y otros)**: se descargaba el archivo equivocado de Forge y el juego abría Vanilla. Ahora usa el instalador correcto y abre con Forge y sus mods.

## 1.0.136
- **Aviso de actualización discreto**: ya no sale la franja verde grande; ahora es un botón pequeño arriba («Actualizar a …») y también está en Ajustes → Actualizaciones.
- **Logo de la barra lateral**: ya no se corta en pantallas grandes; queda siempre visible.

## 1.0.135
- **Modpacks de Forge que abrían como Vanilla** (ej. RLCraft de CurseForge): ahora se comprueba el instalador de Forge antes de jugar; si está dañado se vuelve a descargar y, si es demasiado viejo, se usa la versión recomendada de Forge para ese Minecraft. Si algo falla, se ve el motivo en la Consola en vez de abrir Vanilla sin avisar.

## 1.0.134
- **Animación de inicio completa**: el sonido ya no se corta en «Nova»; ahora suena la animación entera (~9 s) y el launcher espera a que termine.

## 1.0.133
- **Una sola pantalla de carga**: mientras suena la animación de inicio ya no se ve la animación vieja por detrás; solo vuelve si el video no puede reproducirse.
- **Panel de Versiones**: se arregló que el título, las etiquetas y la descripción quedaran tapados por la imagen.

## 1.0.132
- **Pexy y sus amigos ya no tapan el contenido**: con las mascotas activas queda una franja libre abajo para que caminen sin pisar títulos.
- **Pexy reacciona al internet**: comenta cuando se va y cuando vuelve la conexión.

## 1.0.131
- La barra superior ya no repite el nombre de usuario (sale en la tarjeta de abajo a la izquierda); arriba queda solo el avatar con su menú.

## 1.0.130
- **Quilt y NeoForge**: ya puedes crear perfiles con Quilt (desde 1.14) y NeoForge (desde 1.20.2), en Versiones y en el asistente de perfiles.
- **Versión del loader**: en los ajustes de un perfil puedes escribir la versión exacta de Fabric, Quilt, Forge o NeoForge; vacía usa la recomendada.
- **Nova Client en 1.15.2** (ahora de 1.15.2 y de 1.16.5 a 26.3).
- **Barra superior**: botón de ayuda con accesos a novedades, consola y búsqueda.
- Textos nuevos traducidos a los 7 idiomas.

## 1.0.129
- **Acceso obligatorio**: después de la animación de inicio, si no has iniciado sesión solo se ve la pantalla para entrar (Microsoft o sin premium) o elegir una cuenta guardada. Al entrar o registrarte aparece el launcher. Al cerrar sesión vuelve esa pantalla.

## 1.0.128
- **Nueva animación de inicio**: al abrir el launcher se reproduce el logo animado NOVA PX con su sonido (5 segundos). Se salta con un clic. En Ajustes > Apariencia puedes quitar el sonido o la animación completa.

## 1.0.127
- **Versiones más claras**: con Nova solo salen las versiones que ya tienen Nova Client (1.16.5 a 26.3); con Fabric, Forge y OptiFine solo las que de verdad funcionan con ese loader; con Vanilla salen todas, de la 1.0 a la más reciente.
- **Versiones de prueba**: en Vanilla hay un interruptor «Mostrar versiones de prueba» (apagado por defecto) que muestra snapshots, pre-releases y release candidates en una sección aparte, agrupados por año.
- **Panel derecho renovado**: imagen grande, etiquetas (estable/prueba, Java, Nova Client), fecha de lanzamiento, si ya tienes perfil y los loaders como tarjetas con su descripción.

## 1.0.126
- **Nova Client para Minecraft 26.x**: el perfil Nova ahora incluye el Nova Client en 26.1, 26.1.1, 26.1.2, 26.2 y 26.3 (menú con Shift derecho, FPS, CPS, teclas, zoom, coordenadas y armadura). Ya cubre de 1.16.5 a 26.3.

## 1.0.125
- **Barra superior nueva**: búsqueda rápida de páginas y modpacks (también con Ctrl+K), campana con los últimos avisos y tu cuenta con menú (cuenta, skins, ajustes, cerrar sesión).

## 1.0.124
- **OptiFine solo, sin Forge**: el perfil OptiFine baja el .jar oficial de optifine.net y, al pulsar Jugar por primera vez, ejecuta su instalador oficial sin ventana (crea una versión «<mc>-OptiFine_…»). Ya no instala Forge. Los perfiles OptiFine anteriores con Forge siguen funcionando.
- **Nova Client** disponible de 1.16.5 a 1.21.11 (ver 1.0.121).

## 1.0.123
- **Ajustes**: nuevas secciones **Discord** y **Notificaciones**, el espacio que ocupa cada carpeta del juego, la RAM libre y los extremos del deslizador de memoria, y **«Usar estos ajustes en todos mis perfiles»** para sincronizar RAM, ventana y Java.

## 1.0.122
- **Imágenes oficiales también en las versiones antiguas**: 1.12 y anteriores (hasta 1.1) usan la portada oficial de cada versión, leída en vivo de minecraft.wiki (no se guardan en Nova PX). Si una versión no tiene imagen sigue el paisaje propio.

## 1.0.121
- **Nova Client para más versiones**: ahora existe de Minecraft 1.16.5 a 1.21.11 (antes solo 1.20 en adelante). El perfil Nova lo instala solo.

## 1.0.120
- **OptiFine se instala solo**: al crear un perfil OptiFine el launcher baja el .jar oficial directamente de optifine.net y lo deja en Mods (ya no tienes que descargarlo tú). No se guarda ni se redistribuye.
- **Versiones bien ordenadas**: «Más nuevas primero» ya no mezcla 1.9 con 1.21.
- **Tarjetas sin imagen oficial**: las versiones que Mojang no ilustra ahora tienen un paisaje propio en lugar de solo un degradado.

## 1.0.119
- **Imágenes oficiales de Minecraft en «Versiones»**: cada tarjeta y el panel de la derecha muestran la imagen oficial de esa versión. Se cargan en línea del contenido que publica Mojang para su launcher y no se guardan en Nova PX; si una versión no tiene imagen (las anteriores a la 1.13) se ve el degradado de siempre.

## 1.0.118
- **Nueva página «Versiones»** (menú lateral): una tarjeta por versión de Minecraft (26, 1.21, 1.20…) con buscador y orden. A la derecha eliges la versión exacta y el loader (Nova, Fabric, Forge, OptiFine o Vanilla) y pulsas **Jugar**: si ya tienes un perfil así lo abre, y si no lo crea al momento.
- **Nuevo perfil con tarjetas grandes**: cada opción (Asistente, Instalar modpack, Importar archivo, Importar de otros launchers, Importar carpeta y Servidor de prueba) ahora es una tarjeta con icono grande.
- **Importar desde otros launchers en cuadrícula**: primero eliges el launcher (Modrinth App, CurseForge, Prism, MultiMC, ATLauncher, GDLauncher) y ves cuántos perfiles encontró de cada uno; luego marcas cuáles traer.
- **Menos tirones al jugar**: con Java 17 o más nuevo (Minecraft 1.18 en adelante) el juego usa ahora un recolector de memoria afinado y arranca con la memoria ya reservada. Si pones tus propios argumentos en Ajustes, se respetan.

## 1.0.117
- **La descarga de actualizaciones del launcher ahora va en el botón de descargas de arriba**, con su porcentaje y su historial, y ya no como una barra grande que ocupaba la pantalla. Cuando termina, solo queda el aviso para reiniciar e instalar.
- **Tus servidores de prueba se ven en la Biblioteca** (sección «Mis servidores de prueba», con un clic se abren) y el menú lateral vuelve a tener «Servidores». Antes, al crear uno no quedaba claro dónde estaba.

## 1.0.116
- **Crear instancia y servidor en un mismo cuadro, más compacto**: icono con **Subir** (tu imagen), **Aleatorio** y **Personalizar** (emoji), nombre, loader en botones y versión de Minecraft en una lista. Arriba eliges **Instancia** o **Servidor de prueba** (este último con su tipo, versión y memoria), y desde «Nuevo perfil» → «Servidor de prueba» se abre ya en ese modo.
- **Ya no se abre la ventana negra de comandos al jugar** (salía con Forge 1.16.5 y Java 8 del sistema): en Windows el juego se inicia con javaw, el mismo Java pero sin consola.

## 1.0.115
- **Servidor de prueba dentro de «Nuevo perfil»**: ahora se crea desde el cuadro de Nuevo perfil (tarjeta «Servidor de prueba»), junto a Asistente e Importar. Ya no ocupa un botón aparte en el menú lateral.
- **Ajustes del servidor rediseñados**: agrupados en tarjetas (General, Reglas del juego, Acceso, Mundo), con interruptores en vez de listas Sí/No, ayuda en cada opción y valores por defecto (antes PvP, volar, spawn, distancia y mundo salían vacíos).
- La pestaña de contenido ya no dice «mods» cuando tu servidor solo usa plugins y datapacks: se llama «Plugins y datapacks», «Mods y datapacks» según el tipo.

## 1.0.114
- **Servidores de prueba → Plugins, mods y datapacks**: ahora la lista de lo más descargado aparece sola al abrir la pestaña y al cambiar de tipo (antes había que pulsar «Buscar» y con versiones nuevas como la 26.3 salía vacía). Cada resultado muestra su icono, la tienda de donde viene y cuántas descargas tiene.
- **Más tiendas**: los plugins se buscan a la vez en **Modrinth, Hangar y SpigotMC** (solo los gratuitos que se pueden bajar directo). Los datapacks y mods siguen en Modrinth.
- **Versiones muy nuevas de Minecraft**: si todavía no hay nada marcado para tu versión, se muestra igual lo más descargado con un aviso, y al instalar se avisa si el archivo puede no ser compatible.

## 1.0.113
- **Panel de descargas**: el botón de descargas de arriba ahora abre una lista con lo que se está descargando (con barra de avance) y el **historial** de lo ya terminado (se puede borrar). La importación de instancias, la instalación de modpacks y la descarga del juego se ven ahí, ya no en un cuadro abajo a la derecha.
- **Novedades y soporte rediseñado**: cabecera con tu versión, tarjetas de ayuda (Discord, copiar reporte, guía, carpeta) y el historial con etiquetas «Nuevo» y «Arreglo»; las versiones viejas se despliegan al pulsarlas.
- **Nuevo servidor más claro**: eliges el tipo en tarjetas con una descripción (Vanilla, Paper, Purpur, Spigot, Fabric, Forge, NeoForge) y la memoria con botones rápidos.
- **Inicio más limpio**: el recuadro grande ya no usa el icono del modpack ampliado y borroso; ahora lleva un degradado con el color principal del icono.

## 1.0.112
- **Administración → Historial**: al editar un evento ya se ven los participantes con nombre que tiene guardados (por ejemplo los 64 de RubroCraft Nations) y se pueden quitar uno por uno con «Quitar». Antes esa lista estaba oculta y no se podía tocar.

## 1.0.111
- **Importar instancias muestra el avance real**: ahora dice qué instancia copia y «n de m archivos» con barra que avanza, y el launcher ya no se congela mientras copia.
- **Las instancias importadas traen su imagen**: se usa la miniatura de la instancia de CurseForge o, si no tiene, la del modpack del mismo nombre en Modrinth.
- **Perfil del equipo más ordenado**: los enlaces van de dos en dos y, si queda uno solo, se centra en lugar de quedarse pegado a la izquierda.

## 1.0.110
- **Modpacks de FTB ya se pueden instalar**: todas sus versiones salían como «descarga bloqueada» y el botón Instalar no se activaba. Era un error de la lista; ahora se eligen e instalan normal.

## 1.0.109
- **La mascota ya se ve en pantalla completa**: la ventana flotante de PX se vuelve a poner por encima del juego cada segundo, así no se queda detrás cuando Minecraft pasa a pantalla completa (F11).

## 1.0.108
- **Plugins propios con ficha**: cada plugin puede llevar imagen, descripción, información, creador (con enlace) y hasta 2 enlaces. Todo eso se ve en «Servidores → Plugins de Nova PX» aunque el plugin esté **bloqueado**; solo la descarga queda protegida hasta que se escriba la clave. En administración hay un botón **Editar** para cambiar la ficha sin volver a subir el archivo.

## 1.0.107
- **Plugins propios de Nova PX** (administración → pestaña Plugins): sube tus `.jar` y aparecen en «Servidores → Plugins, mods y datapacks» para instalarlos en un clic. Cada plugin puede ser **público** o **bloqueado**: los bloqueados se publican cifrados y solo se instalan con la contraseña de la biblioteca (el archivo público no sirve sin ella). Puedes bloquear, hacer público o quitar un plugin cuando quieras.

## 1.0.106
- **Servidores de prueba** (por ahora solo para administradores): nueva pestaña para crear un servidor en tu computadora, configurarlo, encenderlo con consola y comandos, y probarlo entrando a `localhost`. Soporta Vanilla, Paper, Purpur, Spigot, Fabric, Forge y NeoForge; descarga la versión y el Java que hagan falta. Editas `server.properties` con una lista de opciones, instalas plugins, mods y datapacks desde Modrinth, y al terminar exportas todo en un `.zip` listo para subir a tu host. El EULA lo aceptas tú.
- **Novedades y soporte**: nueva pestaña con el historial de cambios del launcher y accesos de ayuda (Discord, copiar reporte, guía para reportar errores, carpeta del juego). Tras actualizar, el launcher muestra una ventana con lo nuevo.

## 1.0.105
- **Copiar reporte** (pestaña Consola): copia un resumen corto listo para pegar en el canal de comentarios: versión, sistema, tipo de cuenta, qué se estaba jugando y las últimas 40 líneas del registro (ocultando tu usuario y recortando las líneas larguísimas). Nueva guía `docs/REPORTAR-ERRORES.md` con la plantilla para beta testers.

## 1.0.104
- **La mascota se llama Pexy**: es su nombre oficial. Cambia en los textos del launcher (charla, «Cuidar a Pexy», ajustes, ventana flotante) y es el nombre que trae al nacer. Si alguien le había puesto un nombre propio, se respeta.

## 1.0.103
- **Revisión general del código**: sin errores de sintaxis ni referencias rotas; los datos publicados (eventos, equipo, noticias, anuncios, administradores, nicks) pasan una prueba nueva que comprueba formato, nicks, fechas, enlaces https e imágenes existentes.
- **Revisión de nicks por turnos**: con más de 150 nicks se revisan primero los nuevos y luego los más antiguos, en vez de dejar fuera a los últimos. Ya no se publican cambios innecesarios (solo se avisa a todos cuando hay un cambio real).
- **Aviso de contenido nuevo** respeta «compartir uso»: con esa opción apagada lee el aviso directo del repositorio, sin contactar al Worker.
- **Rendimiento**: la mascota deja de recalcular su posición cuando la ventana está en segundo plano. Se evita abrir dos veces el nacimiento de PX.
- Política de privacidad actualizada (IA de PX solo para administradores, datos locales de PX, avisos de contenido).

## 1.0.102
- **Cambios del administrador, casi al instante**: cuando publicas algo (evento, modpack, noticia, ajustes), los demás launchers lo reciben en unos 20 segundos en lugar de hasta 10 minutos. El launcher consulta un aviso diminuto del Worker cada 20 s y, si cambió, recarga los datos. Además el reloj normal de ajustes remotos baja de 10 a 3 minutos. El aviso se guarda automáticamente al publicar (sin claves extra).

## 1.0.100
- **Skin secreta «Sombra» para PX** (solo con el modo administrador activo): un encapuchado oscuro con ojos rojos brillantes, una X roja en el pecho, mangas rayadas, un resplandor rojo bajo los pies y brasas que suben. Se elige en «Cuidar a PX» y también aparece en la ventana flotante sobre Minecraft. Los demás usuarios no la ven.

## 1.0.99
- **PX te acompaña mientras juegas** (opcional, apagado por defecto, en Ajustes → Apariencia): una ventanita transparente con PX y su accesorio flota en la esquina inferior derecha sobre Minecraft y muestra lo que dice (incluidas sus reacciones a tu partida). Los clics pasan al juego, no roba el foco, solo aparece mientras Minecraft está abierto y se cierra con él. Funciona con el juego en ventana o ventana sin bordes (no con pantalla completa exclusiva).

## 1.0.98
- **Accesorios para PX**: moño, sombrero, bufanda, gafas y corona, dibujados en píxeles como el panda. Se desbloquean subiendo de nivel o con rachas de días y se eligen en «Cuidar a PX».

## 1.0.97
- **PX ve tu partida** (opcional, apagado por defecto, en Ajustes → Apariencia): lee solo el texto del registro de Minecraft, en tu PC, y reacciona cuando mueres (según cómo: lava, caída, creeper…), logras un avance o desafío, entras a un servidor o te mencionan en el chat. No usa IA ni envía nada a internet.

## 1.0.96
- **El nacimiento de PX**: la primera vez que abres el launcher aparece un huevo que se mueve; lo tocas tres veces, PX nace y le pones su nombre. Pasa una sola vez.

## 1.0.95
- **Minijuego «Atrapar estrellas»** con PX (en Cuidar a PX): 20 segundos moviendo el cursor para atrapar estrellas y esquivar rocas. Da cariño y puntos, cansa un poco a PX y guarda tu récord.

## 1.0.94
- **PX cobra vida**: ahora tiene hambre, energía y cariño que bajan con el tiempo. Desde Ajustes → Apariencia → «Cuidar a PX» (o con doble clic sobre PX) le das de comer, juegas, lo acaricias o lo dejas dormir, y le pones nombre. Gana puntos y sube de nivel, lleva una racha de días seguidos y gana puntos extra cuando juegas Minecraft. Si se descuida, te lo hace saber (poco y sin molestar).

## 1.0.93
- **PX con IA solo para administradores**: la charla con IA de la mascota (y su opción en Ajustes) solo aparece con el modo administrador activo. Los demás siguen con las reglas locales de PX.

## 1.0.92
- **Acomodar la foto antes de subirla** (administración): después de elegir una imagen se abre un recuadro para moverla y acercarla, como en Instagram o X; solo se sube lo que ves dentro del cuadro. Aplica a la imagen y el fondo de eventos, banner/logo, foto de perfil del equipo, noticias, anuncios y patrocinadores. También puedes «Subir sin recortar». Las skins no se recortan.
- **Cambios de nombre**: si un jugador cambia su nick de Minecraft, el launcher muestra el nuevo (y por tanto su skin actual) en ganadores, participantes, colaboraciones, comisionados y equipo.
- **Advertencias** (nueva pestaña de administración): revisa los nicks contra Mojang, avisa de quién cambió de nombre o ya no existe, y permite marcarlo como revisado, quitarlo del launcher (nombres inapropiados) o asignarle su nick actual.

## 1.0.91
- **Tema Nova Eclipse**: el antiguo tema secreto de un creador externo pasa a ser un tema de NovaPX para todos (azul noche con rojo). Trae fondo con estrellas y el logo de Nova, **color de selección** rojo, **cursor propio** (flecha con estrella) y **sonidos suaves** al pasar el cursor (un tic musical en botones y un susurro cósmico en tarjetas grandes). Los sonidos se generan en el equipo, solo suenan con este tema y se apagan en Ajustes → Apariencia.
- Se quita el desbloqueo de temas secretos por persona: las menciones a otros creadores quedan solo en los eventos.

## 1.0.90
- **Ajustes**: el botón «Guardar ajustes» solo aparece cuando cambias algo y desaparece al guardar.
- **Eventos**: las portadas rellenan su marco sin bordes difuminados; el desenfoque queda solo en el detalle del evento, detrás de las imágenes que no llenan el cuadro (como los logos verticales). Los enlaces del evento (post de X, tráiler…) van centrados justo debajo de la descripción.
- **Inicio**: la imagen de NovaPX se ajusta al marco sin bordes difuminados, sea cual sea la resolución.

## 1.0.89
- **Clic derecho**: el menú ahora es solo texto, sin emojis de Windows, para que se vea más serio y uniforme.
- **Criaturas pixeladas**: vienen **apagadas por defecto**; quien las quiera las activa en Ajustes → Apariencia.
- **Cabezas 3D**: un poco más pequeñas en Participantes y Ganadores para que las esquinas ya no se salgan del cuadro ni tapen el texto.
- **Administración**: el alta de participantes con nombre queda en pausa (los ya guardados se siguen mostrando).
- Se quitan las menciones a «Proyecto PX»: somos NovaPX.

## 1.0.88
- **Eventos**: los participantes con grupo (como las 4 naciones de RubroCraft Nations) ahora se muestran **separados por grupo**, cada uno con su título, en vez de todos pegados.
- **PX con IA**: ya está publicada y funcionando con Workers AI de Cloudflare (sin clave de pago, con tope diario). Es una IA más sencilla que Claude: sirve para charlar y chistes; si algún día se pone una clave de Anthropic, el mismo servidor pasa a usar Claude solo.

## 1.0.87
- **Eventos**: los participantes (y colaboradores) ahora se ven como la **cabeza del jugador en 3D**, igual que los ganadores, y todas las cabezas 3D del launcher quedan **fijas** (sin balanceo ni giro).
- **PX con IA (opcional, apagado por defecto)**: en Ajustes → Apariencia puedes activar que PX charle contigo con IA (Claude), sea bromista, aprenda gustos y te ayude a entender un error de Minecraft («Revisar mi último error»). Haz clic en PX para abrir su chat. Tiene tope diario de mensajes, no guarda las conversaciones en el servidor, quita tu usuario y claves de los registros antes de enviarlos y guarda lo aprendido solo en tu PC (botón «Olvidar todo»). Sin internet o sin cupo, PX sigue con sus reglas locales.

## 1.0.86
- **Eventos**: añadidos los participantes de RubroCraft Nations (64 jugadores, por nación) y de Cobblemon PX, el evento «PX Play's», y corregidas las fechas de OneBlock Deathmatch y OneBlock 1000 días (eran de 2025). La lista de participantes de un evento ahora admite hasta 80 nombres.

## 1.0.85
- **PX, la mascota, ahora tiene personalidad**: te saluda por tu nick según la hora (y se acuerda de cuánto llevas sin venir), te mira cuando pasas el cursor, salta si le haces clic, se deja acariciar, se duerme si no tocas nada y se despierta al volver. Comenta cuando abres o cierras Minecraft (avisa si jugaste mucho rato o si se cerró con error y te manda a la Consola) y cuando termina de instalarse un modpack. Ya no huye del cursor.
- Todo funciona sin internet y no envía nada: la memoria (visitas, caricias) queda solo en tu PC. Se apaga en Ajustes → Apariencia → «PX, la mascota, habla y reacciona», o con «Criaturas pixeladas».

## 1.0.84
- **NeoForge** (Minecraft 1.20.2 en adelante): el launcher descarga el instalador oficial, elige la versión adecuada y juega modpacks de NeoForge. Antes salían como «no soportados». Función nueva: pruébala y avisa si algún modpack da problemas.
- **Modpacks de CurseForge**: ya se pueden importar los `.zip` descargados de la web de CurseForge (Importar archivo o arrastrándolos). Los mods cuyo autor bloquea las descargas externas se avisan y se omiten. La clave de CurseForge vive en un servidor intermedio, nunca dentro del launcher.
- **Catálogo FTB (Feed The Beast)**: en Explorar modpacks hay un selector Modrinth / FTB para buscar e instalar modpacks de FTB.
- Los modpacks, instancias de Prism/MultiMC/ATLauncher/Modrinth App y `.mrpack` de NeoForge ya se importan (Quilt sigue sin soporte).

## 1.0.83
- Tema secreto «Laos ✦ Edición secreta» (azul noche con rojo): solo aparece en Ajustes → Apariencia para la cuenta premium de LaosOneView (se comprueba su UUID, no el nick) y para los administradores.
- Estela del cursor distinta para cada tema y temporada (copos en Navidad, brasas en Halloween, corazones en San Valentín, pétalos, confeti, chispas, píxeles…) y ráfaga al hacer clic.
- Criaturas pixeladas de diseño propio (conejo, pollito, zorro, pingüino, fantasma, calabaza, abeja y robot Nova) que pasean por abajo según el tema y la temporada; huyen si les acercas el cursor. La mascota de Proyecto PX (el panda rosa de bloques, diseño de @DekerModMaker) pasea siempre con ellas. Se apagan con «Efectos animados» o por separado en Ajustes → Apariencia.

## 1.0.82
- Varias cuentas: guarda cuentas de Microsoft y nicks sin conexión a la vez y cambia entre ellas con un clic en Cuenta → «Tus cuentas». Cada cuenta conserva su skin, amigos y tiempo de juego. «Cerrar sesión» quita solo la cuenta activa.
- Cada modpack puede recordar con qué cuenta se juega (Ajustes del modpack → Cuenta): al pulsar Jugar el launcher cambia solo. Esa elección no se exporta.
- Arreglo: el logo de la barra lateral se veía raro (recuadro punteado y fondo oscuro) por un estilo del editor de patrocinadores que lo pisaba.
- Ventana pequeña: la barra lateral ya no se corta (se compacta según la altura) y el botón de cuenta se ve también en modo compacto.

## 1.0.81
- Actualizaciones en un clic también para shaders y texturas (antes solo mods). La lista muestra el tipo de cada elemento.
- Al abrir el contenido de un modpack, el launcher busca solo las versiones nuevas y las cuenta en el botón «Buscar actualizaciones (N)».

## 1.0.80
- Nueva zona de Publicidad: banners de anunciantes en Inicio y Evento, siempre con la etiqueta «Publicidad». Admin → Publicidad: anunciante, imagen, enlace, texto, fechas, dónde sale y activar/desactivar; se rota entre los anuncios activos.
- Vistas y clics por anuncio (contador anónimo, respeta la opción de compartir uso) visibles en el panel con el porcentaje de clics.

## 1.0.79
- Importación directa desde otros launchers: el launcher busca solo tus instancias de Prism, PolyMC, MultiMC, ATLauncher, CurseForge App y Modrinth App en sus carpetas habituales, las lista con versión, loader y número de mods, y copia las que marques (las originales no se tocan). Las de NeoForge/Quilt salen avisadas como no soportadas.
- "Nuevo perfil" rediseñado al estilo Modrinth: buscador con foco, divisor "o" y una columna de opciones con icono (Asistente, Instalar modpack, Importar archivo, Importar desde otros launchers, Importar una carpeta).
- Biblioteca rediseñada: encabezado con descripción, tarjetas de resumen (modpacks, creados por ti, loader más usado, último jugado), barra de filtros en panel y tarjetas más grandes.

## 1.0.78
- Admin → Noticias rediseñado: tarjeta por noticia con imagen en miniatura, título grande, selector de fecha, texto con contador, enlaces a la vista y vista previa en vivo de cómo se ve en Inicio.

## 1.0.77
- Aviso de actualización rediseñado: tarjeta con icono, barra de progreso con porcentaje y, al terminar, aviso verde con botón para reiniciar e instalar.

## 1.0.76
- Permisos: las instrucciones para colaboradores ahora indican un token **classic** con permiso `public_repo` (GitHub no muestra repositorios ajenos al crear tokens fine-grained). El launcher acepta ambos tipos.

## 1.0.75
- Evento: el hosting, los patrocinadores y los créditos ahora son tres grupos separados. El hosting oficial (por ejemplo Holi Hosting) sale con una tarjeta grande y destacada con botón "Visitar"; los patrocinadores del evento con su logo; los créditos como etiquetas pequeñas.
- Admin → Evento: editor nuevo por grupos con logo en miniatura, rol, enlace y mensaje/promo; el modpack, los datos y la publicación quedan en 4 pasos.
- Compatible con los datos anteriores (se clasifican por su rol).

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
