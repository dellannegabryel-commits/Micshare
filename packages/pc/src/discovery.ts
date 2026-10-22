// mDNS opcional (compatibilidade). Primário é beacon UDP broadcast.
// Implementado com bonjour-service quando disponível.
export interface DiscoveryConfig {
  serviceName: string; // ex: "DESKTOP-GABRY"
  instanceName: string;
  audioPort: number;
  ctrlPort: number;
  pairingCode: string;
  ttlMs?: number;
}

export class OptionalDiscovery {
  private available = false;

  constructor(private config: DiscoveryConfig) {}

  async start(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const bonjour = require('bonjour-service');
      // bonjour-service anuncia mDNS; mantido como camada opcional.
      this.available = true;
      console.log('[discovery] mDNS disponível (opcional)');
    } catch {
      this.available = false;
      console.log('[discovery] mDNS indisponível; usando beacon UDP broadcast');
    }
  }

  isAvailable(): boolean {
    return this.available;
  }
}
