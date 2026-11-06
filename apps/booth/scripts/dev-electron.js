const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const preferPort = Number(process.env.VITE_PORT || 5173);
const candidatePorts = Array.from({ length: 20 }, (_, index) => preferPort + index);

let lastError = '';

// Plain http.get (no global fetch needed) against both loopback spellings:
// Vite listens on 0.0.0.0 (IPv4), while "localhost" may resolve to ::1.
function getHtml(host, port) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/', timeout: 1500 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) => {
      if (port === preferPort) lastError = `${host}:${port} ${err.code || err.message}`;
      resolve('');
    });
  });
}

async function fetchHtml(port) {
  for (const host of ['127.0.0.1', 'localhost', '::1']) {
    const html = await getHtml(host, port);
    if (html) return html;
  }
  return '';
}

async function findRendererPort() {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    for (const port of candidatePorts) {
      const html = await fetchHtml(port);
      if (html.includes('/src/main.tsx') || html.includes('/@vite/client')) {
        return String(port);
      }
      if (html && port === preferPort) lastError = `port ${port} answered, but not with the booth renderer page`;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Renderer never became reachable on ports ${candidatePorts.join(', ')} (last error: ${lastError || 'none'})`,
  );
}

async function start() {
  let rendererPort;

  try {
    rendererPort = await findRendererPort();
    console.log(`Renderer is up on port ${rendererPort}! Building Electron...`);
  } catch (err) {
    console.error('Renderer did not start in time:', err.message || err);
    process.exit(1);
  }

  const tsc = spawn('npx', ['tsc', '-p', 'electron/tsconfig.json'], {
    shell: true,
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
  });

  tsc.on('close', (code) => {
    if (code !== 0) {
      console.error('Electron compilation failed');
      process.exit(1);
    }

    console.log('Electron built successfully. Spawning Electron...');

    const electron = spawn('npx', ['electron', '.'], {
      shell: true,
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'development', VITE_PORT: rendererPort },
    });

    electron.on('close', (code) => {
      process.exit(code);
    });
  });
}

start();
