# CampusCare · Reporte de daños

Interfaz en HTML, CSS y JavaScript. Un servidor pequeño de Node.js conecta la página con MySQL; el navegador no guarda contraseñas de base de datos.

## Iniciar

1. Instala Node.js LTS si aún no está instalado.
2. Abre XAMPP e inicia **MySQL**. Apache no es necesario.
3. Haz doble clic en `Iniciar.bat`.
4. Abre `http://localhost:8000` en el navegador.

La primera vez, el archivo de inicio instala el conector de MySQL. La conexión se configura en `.env`; sus valores iniciales usan `reporte_danos`, `root` y contraseña vacía. Ajusta `DB_USERNAME` o `DB_PASSWORD` si tu MySQL tiene otras credenciales.

La página está en `public/html/estructura.html`, los estilos en `public/css/estilos.css` y la lógica del navegador en `public/js/logica.js`. `server.js` sirve la página y guarda equipos, reportes y cambios de estado en MySQL. En el panel puedes usar **Agregar equipo** para cargar el inventario real de cada salón; no se precargan computadores ficticios.
