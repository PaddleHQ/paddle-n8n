#!/usr/bin/env node
// Watch mode for testing against an n8n that runs elsewhere (e.g. Docker), where
// n8n's own file watching is unavailable. Rebuilds on save and, after each
// successful compile, asks n8n to reload custom nodes. Refresh the browser to see changes.
//
//   N8N_URL=http://localhost:5678 pnpm dev:docker

import { spawn } from 'node:child_process';

const n8nUrl = (process.env.N8N_URL ?? 'http://localhost:5678').replace(/\/$/, '');

async function reload() {
	try {
		const res = await fetch(`${n8nUrl}/rest/dev/reload`, { method: 'POST' });
		console.log(res.ok ? `↻ n8n reloaded nodes (${n8nUrl})` : `✗ n8n reload failed: HTTP ${res.status}`);
	} catch (error) {
		console.log(`✗ Could not reach n8n at ${n8nUrl}: ${error.message}`);
	}
}

const tsc = spawn('pnpm', ['exec', 'tsc', '--watch', '--preserveWatchOutput', '--pretty'], {
	stdio: ['ignore', 'pipe', 'inherit'],
});

tsc.stdout.on('data', (chunk) => {
	const text = chunk.toString();
	process.stdout.write(text);
	if (/Found 0 errors/.test(text)) void reload();
});

tsc.on('exit', (code) => process.exit(code ?? 0));
