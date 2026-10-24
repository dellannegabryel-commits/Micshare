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
import { networkInterfaces } from 'node:os';
export class BeaconSender {
    config;
    socket = null;
    interval = null;
    bound = false;
    broadcastAddresses = ['255.255.255.255'];
    constructor(config) {
        this.config = config;
        this.discoverBroadcastAddresses();
    }
    discoverBroadcastAddresses() {
        try {
            const interfaces = networkInterfaces();
            for (const [name, ifaces] of Object.entries(interfaces)) {
                if (!ifaces)
                    continue;
                for (const iface of ifaces) {
                    if (iface.family === 'IPv4' && !iface.internal && iface.netmask) {
                        const ipParts = iface.address.split('.').map(Number);
                        const maskParts = iface.netmask.split('.').map(Number);
                        const broadcastParts = ipParts.map((octet, i) => octet | (~maskParts[i] & 0xff));
                        const broadcastAddr = broadcastParts.join('.');
                        if (!this.broadcastAddresses.includes(broadcastAddr)) {
                            this.broadcastAddresses.push(broadcastAddr);
                        }
                    }
                }
            }
        }
        catch (e) {
            console.log('[beacon] could not discover subnet broadcasts:', e.message);
        }
    }
    start() {
        if (this.bound)
            return;
        this.socket = createSocket('udp4');
        this.socket.on('error', (err) => console.error('[beacon] socket error:', err));
        // Bind to 0.0.0.0 to send on all interfaces
        this.socket.bind({ port: BEACON_PORT, address: '0.0.0.0' }, () => {
            this.socket.setBroadcast(true);
            this.bound = true;
            this.send();
            this.interval = setInterval(() => this.send(), 1000);
            const localAddr = this.socket.address();
            console.log(`[beacon] bound to ${localAddr.address}:${localAddr.port}, broadcasting to ${this.broadcastAddresses.length} addresses on port ${BEACON_PORT}`);
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
            pair: false, // MVP: no pairing required
            code: '', // empty code for MVP (no pairing)
        });
        const buf = Buffer.from(msg);
        try {
            for (const addr of this.broadcastAddresses) {
                this.socket.send(buf, 0, buf.length, BEACON_PORT, addr);
            }
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
