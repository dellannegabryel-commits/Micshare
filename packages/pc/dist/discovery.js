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
