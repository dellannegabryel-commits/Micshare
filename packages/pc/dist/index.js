import { AudioServer } from './audioServer.js';
const args = process.argv.slice(2);
const config = {};
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--port' && args[i + 1])
        config.audioPort = Number(args[++i]);
    else if (a === '--device' && args[i + 1])
        config.deviceSubstring = args[++i];
    else if (a === '--pairing-code' && args[i + 1])
        config.pairingCode = args[++i];
    else if (a === '--verbose')
        config.verbose = true;
    else if (a === '--list-devices') {
        try {
            const naudiodon2 = require('naudiodon2');
            const devices = naudiodon2.Device.getDevices();
            console.log('Dispositivos de saída de áudio:');
            for (const d of devices)
                console.log(`  [${d.id}] ${d.name} (maxOutputChannels=${d.maxOutputChannels})`);
        }
        catch (e) {
            console.error('naudiodon2 não disponível:', e.message);
        }
        process.exit(0);
    }
    else if (a === '--help' || a === '-h') {
        console.log('Uso: micshare-pc [--port N] [--device substring] [--pairing-code CODE] [--verbose] [--list-devices]');
        process.exit(0);
    }
}
const server = new AudioServer(config);
process.on('SIGINT', () => {
    console.log('\n[micshare] encerrando...');
    server.stop();
    process.exit(0);
});
process.on('SIGTERM', () => {
    server.stop();
    process.exit(0);
});
server.start().catch((err) => {
    console.error('[micshare] falha ao iniciar:', err);
    process.exit(1);
});
