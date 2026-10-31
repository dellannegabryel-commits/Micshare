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
    beaconPort?: number;
    intervalMs?: number;
    pairingEnabled?: boolean;
    pairingCode?: string;
}
export declare class BeaconSender {
    private config;
    private socket;
    private interval;
    private bound;
    private broadcastAddresses;
    private intervalMs;
    private beaconPort;
    private pairingEnabled;
    private pairingCode;
    constructor(config: BeaconConfig);
    private discoverBroadcastAddresses;
    start(): void;
    /** Liga/desliga o beacon sem recriar o socket. */
    setEnabled(enabled: boolean): void;
    setIntervalMs(ms: number): void;
    setPairing(enabled: boolean, code: string): void;
    isRunning(): boolean;
    getIntervalMs(): number;
    getBeaconPort(): number;
    isPairingEnabled(): boolean;
    private restartTimer;
    private send;
    stop(): Promise<void>;
}
