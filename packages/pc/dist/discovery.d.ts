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
export interface BeaconConfig {
    name: string;
    audioPort: number;
    ctrlPort: number;
    pairingCode: string;
}
export declare class BeaconSender {
    private config;
    private socket;
    private interval;
    private bound;
    constructor(config: BeaconConfig);
    start(): void;
    private send;
    stop(): void;
}
