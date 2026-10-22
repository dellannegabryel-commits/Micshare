export interface DiscoveryConfig {
    serviceName: string;
    instanceName: string;
    audioPort: number;
    ctrlPort: number;
    pairingCode: string;
    ttlMs?: number;
}
export declare class OptionalDiscovery {
    private config;
    private available;
    constructor(config: DiscoveryConfig);
    start(): Promise<void>;
    isAvailable(): boolean;
}
