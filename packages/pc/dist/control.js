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
        this.wss = new WebSocketServer({ port: this.config.port });
        this.wss.on('error', (err) => {
            console.error('[controle] WebSocket server error:', err.message);
        });
        this.wss.on('connection', (ws) => {
            let sessionId = null;
            let authenticated = false;
            ws.on('message', (data) => {
                try {
                    const text = data.toString();
                    const { message, error } = parseCtrl(text);
                    if (error || !message) {
                        ws.send(encodeCtrl({ t: 'error', code: 'bad_message', message: error || 'invalid' }));
                        return;
                    }
                    switch (message.t) {
                        case 'hello': {
                            const ok = this.config.onHello(message.token, crypto.randomUUID().slice(0, 8));
                            ok.then((accepted) => {
                                try {
                                    if (!accepted) {
                                        ws.send(encodeCtrl({ t: 'error', code: 'bad_token', message: 'código de pareamento inválido' }));
                                        ws.close();
                                        return;
                                    }
                                    authenticated = true;
                                    sessionId = crypto.randomUUID().slice(0, 8);
                                    this.sessions.set(sessionId, ws);
                                    ws.send(encodeCtrl({
                                        t: 'welcome',
                                        sessionId,
                                        audioPort: 41235,
                                        targetBufferMs: 30,
                                    }));
                                }
                                catch (err) {
                                    console.error('[controle] Error in hello handler:', err.message);
                                    ws.close();
                                }
                            }).catch((err) => {
                                console.error('[controle] Error in onHello promise:', err.message);
                                ws.close();
                            });
                            break;
                        }
                        case 'mute': {
                            if (!authenticated)
                                return;
                            try {
                                this.config.onMute(message.value);
                            }
                            catch (err) {
                                console.error('[controle] Error in onMute:', err.message);
                            }
                            break;
                        }
                        case 'volume': {
                            if (!authenticated)
                                return;
                            try {
                                this.config.onVolume(Math.max(0, Math.min(4, message.value)));
                            }
                            catch (err) {
                                console.error('[controle] Error in onVolume:', err.message);
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
                            ws.send(encodeCtrl({ t: 'error', code: 'unknown', message: `tipo ${message.t} não tratado` }));
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
            console.log(`[controle] WebSocket server listening on port ${this.config.port}`);
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
