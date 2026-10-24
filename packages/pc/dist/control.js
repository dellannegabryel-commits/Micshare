import { WebSocketServer, WebSocket } from 'ws';
import { encodeCtrl, parseCtrl } from '@micshare/protocol';
export class ControlServer {
    config;
    wss = null;
    sessions = new Map();
    reconnects = 0;
    constructor(config) {
        this.config = config;
    }
    start() {
        // Bind WebSocket to 0.0.0.0 to accept connections from all interfaces
        this.wss = new WebSocketServer({
            port: this.config.port,
            host: '0.0.0.0'
        });
        this.wss.on('error', (err) => {
            console.error('[controle] WebSocket server error:', err.message);
        });
        this.wss.on('connection', (ws) => {
            // Auto-authenticate on Hello - no pairing code needed for MVP
            let sessionId = null;
            let authenticated = false;
            ws.on('message', (data) => {
                try {
                    // Ignore binary frames (pong, etc.) and empty messages
                    if (!Buffer.isBuffer(data) && typeof data !== 'string') {
                        return;
                    }
                    const text = data.toString();
                    if (!text.trim()) {
                        return;
                    }
                    console.log('[controle] RX:', text);
                    const { message, error } = parseCtrl(text);
                    if (error || !message) {
                        console.log('[controle] Parse error:', error);
                        ws.send(encodeCtrl({ t: 'error', code: 'bad_message', message: error || 'invalid' }));
                        return;
                    }
                    switch (message.t) {
                        case 'hello': {
                            if (!authenticated) {
                                sessionId = crypto.randomUUID().slice(0, 8);
                                authenticated = true;
                                this.sessions.set(sessionId, ws);
                                const welcome = {
                                    t: 'welcome',
                                    sessionId,
                                    audioPort: 41235,
                                    targetBufferMs: 30,
                                };
                                console.log('[controle] TX welcome:', JSON.stringify(welcome));
                                ws.send(encodeCtrl(welcome));
                                this.config.onHello?.(sessionId);
                            }
                            break;
                        }
                        case 'mute': {
                            if (sessionId && this.sessions.has(sessionId)) {
                                try {
                                    this.config.onMute(message.value);
                                }
                                catch (err) {
                                    console.error('[controle] Error in onMute:', err.message);
                                }
                            }
                            break;
                        }
                        case 'volume': {
                            if (sessionId && this.sessions.has(sessionId)) {
                                try {
                                    this.config.onVolume(Math.max(0, Math.min(4, message.value)));
                                }
                                catch (err) {
                                    console.error('[controle] Error in onVolume:', err.message);
                                }
                            }
                            break;
                        }
                        case 'bye': {
                            if (sessionId) {
                                this.sessions.delete(sessionId);
                                this.config.onBye(sessionId);
                            }
                            ws.close();
                            break;
                        }
                        default:
                            if (sessionId) {
                                ws.send(encodeCtrl({ t: 'error', code: 'unknown', message: `tipo ${message.t} não tratado` }));
                            }
                    }
                }
                catch (err) {
                    console.error('[controle] Error processing message:', err.message);
                }
            });
            ws.on('close', () => {
                if (sessionId) {
                    this.sessions.delete(sessionId);
                    this.reconnects += 1;
                    this.config.onBye(sessionId);
                }
            });
            ws.on('error', (err) => {
                console.error('[controle] WebSocket error:', err.message);
                ws.close();
            });
        });
        this.wss.on('listening', () => {
            // console.log(`[controle] WebSocket server listening on 0.0.0.0:${this.config.port}`);
        });
    }
    broadcastStats(stats) {
        if (!this.wss)
            return;
        try {
            const msg = encodeCtrl({ t: 'stats', ...stats, reconnects: this.reconnects });
            for (const ws of this.sessions.values()) {
                if (ws.readyState === WebSocket.OPEN)
                    ws.send(msg);
            }
        }
        catch (err) {
            console.error('[controle] Error broadcasting stats:', err.message);
        }
    }
    stop() {
        try {
            this.wss?.close();
        }
        catch (err) {
            console.error('[controle] Error stopping server:', err.message);
        }
        this.sessions.clear();
    }
}
