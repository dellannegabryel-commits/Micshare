export interface DiscoveryConfig {
    serviceName: string;
    instanceName: string;
    audioPort: number;
    ctrlPort: number;
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
}
export declare class BeaconSender {
    private config;
    private socket;
    private interval;
    private bound;
    private broadcastAddresses;
    constructor(config: BeaconConfig);
    private discoverBroadcastAddresses;
    start(): void;
    private send;
    stop(): void;
}
