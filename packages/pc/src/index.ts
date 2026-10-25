import { AudioServer } from './audioServer.js';
import { checkVBCableAvailable } from './audioServer.js';
import { spawn } from 'node:child_process';

async function main() {
  const args = process.argv.slice(2);
  const config: { audioPort?: number; deviceSubstring?: string; verbose?: boolean; name?: string } = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--port' && args[i + 1]) config.audioPort = Number(args[++i]);
    else if (a === '--device' && args[i + 1]) config.deviceSubstring = args[++i];
    else if (a === '--name' && args[i + 1]) config.name = args[++i];
    else if (a === '--verbose') config.verbose = true;
    else if (a === '--list-devices') {
      try {
        const naudiodon2 = await import('naudiodon2');
        const devices = naudiodon2.getDevices();
        console.log('Dispositivos de saída de áudio:');
        for (const d of devices) console.log(`  [${d.id}] ${d.name} (maxOutputChannels=${d.maxOutputChannels})`);
      } catch (e) {
        console.error('naudiodon2 não disponível:', (e as Error).message);
      }
      process.exit(0);
    } else if (a === '--help' || a === '-h') {
      console.log('Uso: micshare-pc [--port N] [--device substring] [--name NAME] [--verbose] [--list-devices] [--install-vbcable]');
      process.exit(0);
    } else if (a === '--install-vbcable') {
      console.log('[micshare] Iniciando instalador VB-Cable...');
      const ps = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', 'install-vbcable.ps1'], {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      ps.on('close', (code) => process.exit(code ?? 0));
      return; // Don't start server
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

  await server.start().catch((err) => {
    console.error('[micshare] falha ao iniciar:', err);
    process.exit(1);
  });
}

main();