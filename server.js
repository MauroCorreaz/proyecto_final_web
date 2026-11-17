const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const root = __dirname;
const publicFiles = new Map([
  ['/', ['public/html/estructura.html', 'text/html; charset=utf-8']],
  ['/public/html/estructura.html', ['public/html/estructura.html', 'text/html; charset=utf-8']],
  ['/public/css/estilos.css', ['public/css/estilos.css', 'text/css; charset=utf-8']],
  ['/public/js/logica.js', ['public/js/logica.js', 'text/javascript; charset=utf-8']],
  ['/public/images/logo-uniminuto-mark.png', ['public/images/logo-uniminuto-mark.png', 'image/png']],
  ['/public/images/Uniminuto-horizontal-Colombia.png', ['public/images/Uniminuto-horizontal-Colombia.png', 'image/png']],
]);

function loadEnvironment() {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith('#')) continue;
    process.env[match[1]] ??= match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
}

loadEnvironment();

const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_DATABASE || 'reporte_danos',
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 8,
});

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20_000) throw new Error('El formulario es demasiado largo.');
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new Error('El formulario no tiene un formato válido.');
  }
}

async function getDashboard() {
  const [rows] = await db.query(`
    SELECT r.id AS room_id, r.code AS room_code, r.building, r.room_number,
           e.id AS equipment_id, e.code AS equipment_code, e.kind,
           e.section_code AS equipment_section,
           latest.id AS last_report_id, latest.category AS last_report_category,
           latest.description AS last_report_description,
           CASE WHEN latest.status IS NULL OR latest.status = 'resuelto'
                THEN 'operativo' ELSE latest.status END AS equipment_status
    FROM rooms r
    LEFT JOIN equipment e ON e.room_id = r.id AND e.is_active = 1
    LEFT JOIN reports latest ON latest.id = (
      SELECT rp.id FROM reports rp
      WHERE rp.equipment_id = e.id
      ORDER BY rp.created_at DESC, rp.id DESC LIMIT 1
    )
    WHERE r.is_active = 1
    ORDER BY r.sort_order, e.section_code, e.position_number
  `);

  const rooms = [];
  const byId = new Map();
  for (const row of rows) {
    if (!byId.has(row.room_id)) {
      const room = {
        id: Number(row.room_id), code: row.room_code,
        building: row.building, number: row.room_number, equipment: [],
      };
      rooms.push(room);
      byId.set(row.room_id, room);
    }
    if (row.equipment_id !== null) {
      byId.get(row.room_id).equipment.push({
        id: Number(row.equipment_id), code: row.equipment_code,
        kind: row.kind, section: row.equipment_section, status: row.equipment_status,
        lastReportId: row.last_report_id ? Number(row.last_report_id) : null,
        lastCategory: row.last_report_category || '',
        lastDescription: row.last_report_description || '',
      });
    }
  }

  const [reports] = await db.query(`
    SELECT rp.id, rp.category, rp.description, rp.status, rp.created_at,
           e.code AS equipment_code, r.code AS room_code,
           r.building, r.room_number
    FROM reports rp
    JOIN equipment e ON e.id = rp.equipment_id
    JOIN rooms r ON r.id = e.room_id
    ORDER BY rp.created_at DESC, rp.id DESC
    LIMIT 100
  `);

  const counts = { equipos: 0, operativo: 0, pendiente: 0, revision: 0 };
  for (const room of rooms) {
    for (const equipment of room.equipment) {
      counts.equipos++;
      if (Object.hasOwn(counts, equipment.status)) counts[equipment.status]++;
    }
  }
  return { rooms, reports, counts };
}

async function handleApi(request, response, url) {
  try {
    if (request.method === 'GET' && url.pathname === '/api/dashboard') {
      return sendJson(response, 200, await getDashboard());
    }

    if (request.method === 'POST' && url.pathname === '/api/reports') {
      const body = await readJson(request);
      const equipmentId = Number(body.equipmentId);
      const category = String(body.category || '').trim();
      const description = String(body.description || '').trim();
      const status = String(body.status || 'pendiente');
      const categories = ['Pantalla / monitor', 'Teclado', 'Mouse', 'No enciende', 'Red / internet', 'Ventilador', 'Otro'];

      if (!Number.isInteger(equipmentId) || equipmentId < 1 || !categories.includes(category)
          || !['pendiente', 'revision'].includes(status) || description.length > 2000) {
        return sendJson(response, 400, { error: 'Revisa los datos del reporte.' });
      }
      const [equipment] = await db.execute('SELECT id FROM equipment WHERE id = ? AND is_active = 1', [equipmentId]);
      if (!equipment.length) return sendJson(response, 404, { error: 'No se encontró ese equipo.' });
      await db.execute(
        'INSERT INTO reports (equipment_id, category, description, status) VALUES (?, ?, ?, ?)',
        [equipmentId, category, description, status],
      );
      return sendJson(response, 201, { message: 'Reporte guardado en MySQL.' });
    }

    if (request.method === 'POST' && url.pathname === '/api/equipment') {
      const body = await readJson(request);
      const roomId = Number(body.roomId);
      const section = String(body.section || '').trim().toUpperCase();
      const position = Number(body.position);
      const kind = String(body.kind || 'computador');
      if (!Number.isInteger(roomId) || roomId < 1 || !/^[A-Z]$/.test(section)
          || !Number.isInteger(position) || position < 1 || position > 99
          || !['computador', 'ventilador'].includes(kind)) {
        return sendJson(response, 400, { error: 'Revisa los datos del equipo.' });
      }
      const [rooms] = await db.execute('SELECT id, code FROM rooms WHERE id = ? AND is_active = 1', [roomId]);
      if (!rooms.length) return sendJson(response, 404, { error: 'No se encontró el salón.' });
      const suffix = kind === 'ventilador' ? 'FAN' : 'PC';
      const equipmentCode = `${rooms[0].code}-${section}-${suffix}${String(position).padStart(2, '0')}`;
      await db.execute(
        'INSERT INTO equipment (room_id, code, kind, section_code, position_number) VALUES (?, ?, ?, ?, ?)',
        [roomId, equipmentCode, kind, section, position],
      );
      return sendJson(response, 201, { message: `Equipo ${equipmentCode} agregado.` });
    }

    const statusMatch = url.pathname.match(/^\/api\/reports\/(\d+)\/status$/);
    if (request.method === 'PATCH' && statusMatch) {
      const body = await readJson(request);
      const status = String(body.status || '');
      if (!['pendiente', 'revision', 'resuelto'].includes(status)) {
        return sendJson(response, 400, { error: 'El estado seleccionado no es válido.' });
      }
      const [result] = await db.execute('UPDATE reports SET status = ? WHERE id = ?', [status, Number(statusMatch[1])]);
      if (!result.affectedRows) return sendJson(response, 404, { error: 'No se encontró el reporte.' });
      return sendJson(response, 200, { message: 'Estado actualizado en MySQL.' });
    }

    return sendJson(response, 404, { error: 'Ruta no encontrada.' });
  } catch (error) {
    console.error('Error de la API:', error.message);
    if (error.code === 'ER_DUP_ENTRY') {
      return sendJson(response, 409, { error: 'Ya existe un equipo con esa sección y número en este salón.' });
    }
    return sendJson(response, 500, { error: 'No se pudo guardar. Revisa que MySQL esté activo y que .env tenga los datos correctos.' });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handleApi(request, response, url);

  const file = publicFiles.get(url.pathname);
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('No encontrado');
  }
  try {
    const content = await fs.promises.readFile(path.join(root, file[0]));
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(content);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('No se pudo cargar el archivo.');
  }
});

const port = Number(process.env.PORT || 8000);
server.listen(port, '127.0.0.1', () => {
  console.log(`CampusCare está en http://localhost:${port}`);
  db.query('SELECT 1').then(() => console.log('Conexión a MySQL lista.'))
    .catch((error) => console.error('No se pudo conectar a MySQL:', error.message));
});
