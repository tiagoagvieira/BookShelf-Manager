import { spawn } from 'node:child_process';
const children = [spawn(process.execPath, ['--use-env-proxy', '--watch', 'server/index.mjs'], { stdio: 'inherit', env: { ...process.env, HOST: '127.0.0.1', PORT: '3001' } }), spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' })];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; children.forEach(child => child.kill('SIGTERM')); process.exitCode = code; }
children.forEach(child => child.on('exit', code => stop(code || 0)));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
