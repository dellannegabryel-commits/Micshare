export class OptionalDiscovery {
    config;
    available = false;
    constructor(config) {
        this.config = config;
    }
    async start() {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const bonjour = require('bonjour-service');
            // bonjour-service anuncia mDNS; mantido como camada opcional.
            this.available = true;
            console.log('[discovery] mDNS disponível (opcional)');
        }
        catch {
            this.available = false;
            console.log('[discovery] mDNS indisponível; usando beacon UDP broadcast');
        }
    }
    isAvailable() {
        return this.available;
    }
}
// Beacon UDP broadcast sender (mecanismo primário de descoberta)
import { createSocket } from 'node:dgram';
import { BEACON_PORT } from '@micshare/protocol';
export class BeaconSender {
    config;
    socket = null;
    interval = null;
    bound = false;
    constructor(config) {
        this.config = config;
    }
    start() {
        if (this.bound)
            return;
        this.socket = createSocket('udp4');
        this.socket.on('error', (err) => console.error('[beacon] socket error:', err));
        this.socket.bind(() => {
            this.socket.setBroadcast(true);
            this.bound = true;
            this.send();
            this.interval = setInterval(() => this.send(), 1000);
            console.log(`[beacon] broadcasting on 255.255.255.255:${BEACON_PORT} (${this.config.name})`);
        });
    }
    send() {
        if (!this.socket)
            return;
        const msg = JSON.stringify({
            app: 'micshare',
            v: 1,
            name: this.config.name,
            audioPort: this.config.audioPort,
            ctrlPort: this.config.ctrlPort,
            pair: true,
            code: this.config.pairingCode,
        });
        const buf = Buffer.from(msg);
        try {
            this.socket.send(buf, 0, buf.length, BEACON_PORT, '255.255.255.255');
        }
        catch (e) {
            console.error('[beacon] send error:', e);
        }
    }
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.bound = false;
    }
}
