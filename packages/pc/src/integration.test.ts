import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runTest() {
  const server = spawn('node', [join(__dirname, 'index.js'), '--port', '41235', '--verbose'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverOutput = '';
  server.stdout.on('data', (d) => serverOutput += d.toString());
  server.stderr.on('data', (d) => serverOutput += d.toString());

  // Wait for server to start
  await new Promise(r => setTimeout(r, 1000));

  const client = spawn('node', [join(__dirname, 'fakeClient.js')], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  client.stdout.on('data', (d) => console.log('[client]', d.toString().trim()));
  client.stderr.on('data', (d) => console.error('[client err]', d.toString().trim()));

  await new Promise((resolve) => client.on('exit', resolve));

  // Wait a bit more for stats
  await new Promise(r => setTimeout(r, 2000));

  server.kill();

  console.log('=== SERVER OUTPUT (last 50 lines) ===');
  const lines = serverOutput.trim().split('\n');
  console.log(lines.slice(-50).join('\n'));

  // Check for stats
  const statsLines = lines.filter(l => l.includes('[stats]'));
  if (statsLines.length > 0) {
    console.log('\n=== LAST STATS ===');
    console.log(statsLines[statsLines.length - 1]);
    
    const match = statsLines[statsLines.length - 1].match(/fps=([\d.]+) loss=([\d.]+)% gaps=(\d+)/);
    if (match) {
      const fps = parseFloat(match[1]);
      const loss = parseFloat(match[2]);
      const gaps = parseInt(match[3]);
      console.log(`\nResult: fps=${fps}, loss=${loss}%, gaps=${gaps}`);
      // Expected: ~5% loss (simulated), ~100 fps ideal (measured ~45 over full run including startup)
      // Accept if loss is within 2x simulated (i.e., < 12%) and fps > 20
      if (loss < 12 && fps > 20) {
        console.log('SUCCESS: Integration test passed');
        process.exit(0);
      } else {
        console.log('FAIL: fps too low or loss too high');
        process.exit(1);
      }
    }
  }

  console.log('FAIL: No stats found');
  process.exit(1);
}

runTest().catch((e) => {
  console.error('Test error:', e);
  process.exit(1);
});