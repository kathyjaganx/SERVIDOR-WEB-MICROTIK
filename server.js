const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const ping = require('ping');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Almacenamiento de equipos y logs de eventos
const conexiones = {};
const logsTransacciones = [];

function registrarLog(ip, equipo, evento, tipo = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const log = { id: Date.now(), timestamp, ip, equipo, evento, tipo };
    logsTransacciones.unshift(log);
    if (logsTransacciones.length > 50) logsTransacciones.pop(); // Guardar últimos 50 eventos
    io.emit('nuevo_log', log); // Transmisión en tiempo real
}

// Bucle de monitoreo de Ping en tiempo real (cada 3 segundos)
async function monitorearRed() {
    for (const ip in conexiones) {
        try {
            const res = await ping.promise.probe(ip, { timeout: 2 });
            const estadoPrevio = conexiones[ip].activo;
            conexiones[ip].activo = res.alive;
            conexiones[ip].latencia = res.time !== 'unknown' ? `${res.time} ms` : 'N/A';

            // Si el estado cambia, emitir un log de transacción de red
            if (estadoPrevio !== undefined && estadoPrevio !== res.alive) {
                const mensaje = res.alive ? 'Conexión Restablecida (PING OK)' : 'Pérdida de Conexión (TIMEOUT)';
                const tipoLog = res.alive ? 'success' : 'danger';
                registrarLog(ip, conexiones[ip].nombre, mensaje, tipoLog);
            }
        } catch (error) {
            conexiones[ip].activo = false;
            conexiones[ip].latencia = 'N/A';
        }
    }
    io.emit('actualizar_estado', conexiones);
}

setInterval(monitorearRed, 3000);

app.get('/', (req, res) => {
    let ipCliente = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (ipCliente.includes('::ffff:')) {
        ipCliente = ipCliente.replace('::ffff:', '');
    }

    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Cisco NOC - Network Control Center</title>
        <script src="/socket.io/socket.io.js"></script>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            :root {
                --cisco-blue: #049fd9;
                --cisco-dark-blue: #002c3e;
                --bg-dark: #0b0f19;
                --card-bg: #151c2c;
                --border-color: #232f48;
                --text-main: #e2e8f0;
                --text-muted: #94a3b8;
                --green-accent: #00e676;
                --red-accent: #ff5252;
                --orange-accent: #ffab40;
            }

            body {
                font-family: 'Inter', sans-serif;
                background-color: var(--bg-dark);
                color: var(--text-main);
                margin: 0;
                padding: 20px;
            }

            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 2px solid var(--border-color);
                padding-bottom: 15px;
                margin-bottom: 25px;
            }

            .logo-title {
                display: flex;
                align-items: center;
                gap: 15px;
            }

            .cisco-badge {
                background: var(--cisco-blue);
                color: #fff;
                padding: 6px 14px;
                border-radius: 4px;
                font-weight: 700;
                letter-spacing: 1.5px;
                font-size: 0.9em;
            }

            .title-text {
                font-size: 1.4em;
                font-weight: 700;
                color: #fff;
            }

            .grid-layout {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin-bottom: 20px;
            }

            @media (max-width: 900px) {
                .grid-layout { grid-template-columns: 1fr; }
            }

            .card {
                background: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 8px 16px rgba(0,0,0,0.4);
            }

            .card-header {
                font-size: 1em;
                font-weight: 600;
                color: var(--cisco-blue);
                text-transform: uppercase;
                letter-spacing: 1px;
                margin-bottom: 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .form-group {
                display: flex;
                gap: 10px;
                margin-top: 15px;
            }

            input[type="text"] {
                flex: 1;
                background: #0b0f19;
                border: 1px solid var(--border-color);
                color: #fff;
                padding: 12px;
                border-radius: 6px;
                font-family: 'JetBrains Mono', monospace;
            }

            button {
                background: var(--cisco-blue);
                color: white;
                border: none;
                padding: 12px 20px;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
                transition: 0.2s;
            }

            button:hover {
                background: #0088bd;
            }

            table {
                width: 100%;
                border-collapse: collapse;
            }

            th, td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid var(--border-color);
            }

            th {
                color: var(--text-muted);
                font-size: 0.85em;
                text-transform: uppercase;
            }

            .mono {
                font-family: 'JetBrains Mono', monospace;
            }

            .status-pill {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 4px 10px;
                border-radius: 20px;
                font-size: 0.85em;
                font-weight: 600;
            }

            .status-online {
                background: rgba(0, 230, 118, 0.1);
                color: var(--green-accent);
                border: 1px solid rgba(0, 230, 118, 0.3);
            }

            .status-offline {
                background: rgba(255, 82, 82, 0.1);
                color: var(--red-accent);
                border: 1px solid rgba(255, 82, 82, 0.3);
            }

            .pulse-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
            }

            .online-dot { background: var(--green-accent); box-shadow: 0 0 8px var(--green-accent); }
            .offline-dot { background: var(--red-accent); box-shadow: 0 0 8px var(--red-accent); }

            /* Consola de Transacciones Estilo CISCO CLI */
            .terminal-container {
                background: #05080e;
                border: 1px solid var(--border-color);
                border-radius: 6px;
                height: 250px;
                overflow-y: auto;
                padding: 15px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 0.88em;
            }

            .log-entry {
                margin-bottom: 8px;
                line-height: 1.4;
                border-left: 3px solid var(--border-color);
                padding-left: 10px;
                animation: fadeIn 0.3s ease-in;
            }

            .log-entry.info { border-color: var(--cisco-blue); }
            .log-entry.success { border-color: var(--green-accent); }
            .log-entry.danger { border-color: var(--red-accent); }

            .log-time { color: var(--text-muted); }
            .log-ip { color: var(--orange-accent); }
            .log-action { color: #fff; }

            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-5px); }
                to { opacity: 1; transform: translateY(0); }
            }
        </style>
    </head>
    <body>
         <div class="header">
            <div class="logo-title">
                <span class="cisco-badge">EQUIPO DE TRABAJO</span>
                <span class="title-text">PROYECTO FINAL</span>
            </div>
            <div style="color: var(--green-accent); font-family: 'JetBrains Mono';" id="live-indicator">
                ● SYSTEM ONLINE
            </div>
        </div>

        <div class="grid-layout">
            <div class="card">
                <div class="card-header">
                    <span>Identificación de Terminal</span>
                    <span class="mono" style="color: var(--cisco-blue);">${ipCliente}</span>
                </div>
                
                <!-- Etiqueta de tipo de conexión por cable -->
                <div style="margin-bottom: 12px;">
                    <span class="status-pill status-online" style="background: rgba(4, 159, 217, 0.1); color: var(--cisco-blue); border: 1px solid var(--cisco-blue);">
                        🔌 Conexión por Cable (Ethernet / MikroTik)
                    </span>
                </div>

                <p style="color: var(--text-muted); font-size: 0.9em; margin-top: 0;">
                    Registra esta laptop en el tablero central de control de red.
                </p>
                <form id="registerForm" class="form-group">
                    <input type="hidden" id="clientIp" value="${ipCliente}">
                    <input type="text" id="deviceName" placeholder="Identificador (ej: PC-01 / Laptop-Cable)" required>
                    <button type="submit">Enviar Registro</button>
                </form>
            </div>

            <div class="card">
                <div class="card-header">
                    <span>Estadísticas de Red</span>
                </div>
                <div style="display: flex; justify-content: space-around; text-align: center; margin-top: 10px;">
                    <div>
                        <div style="font-size: 1.8em; font-weight: 700; color: #fff;" id="total-devices">0</div>
                        <div style="color: var(--text-muted); font-size: 0.8em; margin-top: 5px;">EQUIPOS REGISTRADOS</div>
                    </div>
                    <div>
                        <div style="font-size: 1.8em; font-weight: 700; color: var(--green-accent);" id="active-devices">0</div>
                        <div style="color: var(--text-muted); font-size: 0.8em; margin-top: 5px;">PINGS ACTIVOS</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card" style="margin-bottom: 20px;">
            <div class="card-header">
                <span>Tabla de Equipos Conectados en la Red</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Dirección IP</th>
                        <th>Nombre / Dispositivo</th>
                        <th>Estado PING (ICMP)</th>
                        <th>Latencia</th>
                        <th>Última Transacción</th>
                    </tr>
                </thead>
                <tbody id="devicesTable">
                    <tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Sin dispositivos en monitoreo...</td></tr>
                </tbody>
            </table>
        </div>

        <div class="card">
            <div class="card-header">
                <span>Consola de Transacciones en Vivo (CLI Event Log)</span>
            </div>
            <div class="terminal-container" id="terminalLog">
                <div class="log-entry info">
                    <span class="log-time">[SYSTEM]</span> Monitor de transacciones de red inicializado correctamente.
                </div>
            </div>
        </div>

        <script>
            const socket = io();

            const registerForm = document.getElementById('registerForm');
            const deviceNameInput = document.getElementById('deviceName');
            const clientIp = document.getElementById('clientIp').value;
            const devicesTable = document.getElementById('devicesTable');
            const terminalLog = document.getElementById('terminalLog');

            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const nombre = deviceNameInput.value;
                if (nombre) {
                    socket.emit('registrar_equipo', { ip: clientIp, nombre });
                    deviceNameInput.value = '';
                }
            });

            // Recibir actualización de la tabla y métricas
            socket.on('actualizar_estado', (conexiones) => {
                let html = '';
                let total = 0;
                let activos = 0;

                for (const [ip, datos] of Object.entries(conexiones)) {
                    total++;
                    if (datos.activo) activos++;

                    const badge = datos.activo 
                        ? \`<span class="status-pill status-online"><span class="pulse-dot online-dot"></span>ACTIVO</span>\`
                        : \`<span class="status-pill status-offline"><span class="pulse-dot offline-dot"></span>SIN RESPUESTA</span>\`;

                    html += \`
                        <tr>
                            <td class="mono"><b>\${ip}</b></td>
                            <td>\${datos.nombre}</td>
                            <td>\${badge}</td>
                            <td class="mono" style="color: var(--orange-accent);">\${datos.latencia || 'N/A'}</td>
                            <td class="log-time">\${datos.fecha}</td>
                        </tr>\`;
                }

                if (total > 0) devicesTable.innerHTML = html;
                document.getElementById('total-devices').innerText = total;
                document.getElementById('active-devices').innerText = activos;
            });

            // Recibir nuevos eventos en directo para el log de transacciones
            socket.on('nuevo_log', (log) => {
                const logElement = document.createElement('div');
                logElement.className = \`log-entry \${log.tipo}\`;
                logElement.innerHTML = \`
                    <span class="log-time">[\${log.timestamp}]</span>
                    <span class="log-ip">\${log.ip}</span> (\${log.equipo}):
                    <span class="log-action">\${log.evento}</span>
                \`;
                terminalLog.insertBefore(logElement, terminalLog.firstChild);
            });
        </script>
    </body>
    </html>
    `);
});

// Manejo de eventos en WebSockets
io.on('connection', (socket) => {
    socket.emit('actualizar_estado', conexiones);

    socket.on('registrar_equipo', async (data) => {
        const { ip, nombre } = data;
        const resPing = await ping.promise.probe(ip, { timeout: 2 });
        
        conexiones[ip] = {
            nombre: nombre,
            fecha: new Date().toLocaleTimeString(),
            activo: resPing.alive,
            latencia: resPing.time !== 'unknown' ? `${resPing.time} ms` : 'N/A'
        };

        registrarLog(ip, nombre, 'Dispositivo registrado en el tablero', 'info');
        io.emit('actualizar_estado', conexiones);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[CISCO NOC] Servidor escuchando en http://localhost:${PORT}`);
});