import { AudioServer } from './audioServer.js';

const args = process.argv.slice(2);
const config: { audioPort?: number; deviceSubstring?: string; pairingCode?: string; verbose?: boolean; name?: string } = {};

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--port' && args[i + 1]) config.audioPort = Number(args[++i]);
  else if (a === '--device' && args[i + 1]) config.deviceSubstring = args[++i];
  else if (a === '--pairing-code' && args[i + 1]) config.pairingCode = args[++i];
  else if (a === '--name' && args[i + 1]) config.name = args[++i];
  else if (a === '--verbose') config.verbose = true;
  else if (a === '--list-devices') {
    try {
      const naudiodon2 = require('naudiodon2');
      const devices = naudiodon2.getDevices();
      console.log('Dispositivos de saída de áudio:');
      for (const d of devices) console.log(`  [${d.id}] ${d.name} (maxOutputChannels=${d.maxOutputChannels})`);
    } catch (e) {
      console.error('naudiodon2 não disponível:', (e as Error).message);
    }
    process.exit(0);
  } else if (a === '--help' || a === '-h') {
    console.log('Uso: micshare-pc [--port N] [--device substring] [--pairing-code CODE] [--name NAME] [--verbose] [--list-devices]');
    process.exit(0);
  }
}

// Gerar código de pareamento de 6 dígitos se não fornecido
const pairingCode = config.pairingCode ?? String(Math.floor(100000 + Math.random() * 900000));
config.pairingCode = pairingCode;

console.log('╔══════════════════════════════════════╗');
console.log('║  Micshare - Código de Pareamento    ║');
console.log(`║         ${pairingCode}                    ║`);
console.log('╚══════════════════════════════════════╝');
console.log('Digite este código no app mobile para conectar.');

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
