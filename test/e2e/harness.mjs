// The container resolves sandbox-api.paddle.com to this host, so the node's real
// base URL, credential and routing execute unchanged against mock-paddle.
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { API_KEY, FORBIDDEN_KEY, createMockPaddle } from './mock-paddle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IMAGE = process.env.N8N_IMAGE ?? 'docker.io/n8nio/n8n:2.41.3';
const CONTAINER = 'paddle-n8n-e2e';
const PORT = Number(process.env.E2E_N8N_PORT ?? 5678);
export const N8N_URL = `http://localhost:${PORT}`;
const NODE_TYPE = '@paddle/n8n-nodes-paddle.paddle';
const TRIGGER_TYPE = '@paddle/n8n-nodes-paddle.paddleTrigger';

export const rl = (value) => ({ __rl: true, mode: 'id', value });

// The message of an item that failed with "continue on error".
export const errorOf = (item) => {
	const e = item.json.error;
	return typeof e === 'string' ? e : (e?.message ?? JSON.stringify(e));
};

export const CREDENTIALS = {
	good: { id: 'e2ecredgood', name: 'Mock sandbox', apiKey: API_KEY },
	forbidden: { id: 'e2ecredforbid', name: 'Mock sandbox (no permissions)', apiKey: FORBIDDEN_KEY },
	wrong: { id: 'e2ecredwrong', name: 'Mock sandbox (wrong key)', apiKey: 'pdl_sdbx_wrong' },
};

const sh = (cmd, args, opts = {}) =>
	execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const docker = (...args) => sh('docker', args);
const inContainer = (script) => docker('exec', CONTAINER, 'sh', '-c', script);

export class Harness {
	// `sandbox: { apiKey }` runs against the real Paddle sandbox instead of the mock.
	constructor({ sandbox } = {}) {
		this.work = fs.mkdtempSync(path.join(os.tmpdir(), 'paddle-n8n-e2e-'));
		this.cookie = '';
		this.workflowCount = 0;
		this.sandbox = sandbox;
		this.mock = null;
	}

	// Direct call to the real sandbox, for setup, verification and cleanup.
	async paddleApi(method, route, body) {
		const res = await fetch(`https://sandbox-api.paddle.com${route}`, {
			method,
			headers: {
				Authorization: `Bearer ${this.sandbox.apiKey}`,
				'Paddle-Version': '1',
				'Content-Type': 'application/json',
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		const text = await res.text();
		if (!res.ok) throw new Error(`${method} ${route} -> ${res.status}: ${text.slice(0, 300)}`);
		return text ? JSON.parse(text) : undefined;
	}

	async start() {
		if (!this.sandbox) await this.startMock();
		this.buildAndPack();
		this.startContainer();
		this.installPackage();
		await this.waitForN8n();
		await this.setupOwner();
		this.importCredentials();
	}

	// Port 443 is needed because the node's base URL is fixed; on Linux that means
	// root or CAP_NET_BIND_SERVICE.
	async startMock() {
		const certDir = path.join(this.work, 'certs');
		fs.mkdirSync(certDir);
		sh('openssl', [
			'req',
			'-x509',
			'-newkey',
			'rsa:2048',
			'-nodes',
			'-days',
			'2',
			'-keyout',
			path.join(certDir, 'key.pem'),
			'-out',
			path.join(certDir, 'cert.pem'),
			'-subj',
			'/CN=sandbox-api.paddle.com',
			'-addext',
			'subjectAltName=DNS:sandbox-api.paddle.com',
		]);
		const mock = createMockPaddle({
			cert: fs.readFileSync(path.join(certDir, 'cert.pem')),
			key: fs.readFileSync(path.join(certDir, 'key.pem')),
		});
		this.mock = mock;
		await new Promise((resolve, reject) => {
			mock.server.once('error', (error) =>
				reject(new Error(`mock Paddle API could not listen on port 443: ${error.message}`)),
			);
			mock.server.listen(443, '0.0.0.0', resolve);
		});
	}

	buildAndPack() {
		const pkgDir = path.join(this.work, 'pkg');
		fs.mkdirSync(pkgDir);
		if (!process.env.E2E_SKIP_BUILD) sh('pnpm', ['build'], { cwd: ROOT });
		sh('pnpm', ['pack', '--pack-destination', pkgDir], { cwd: ROOT });
		this.tarball = fs.readdirSync(pkgDir).find((f) => f.endsWith('.tgz'));
	}

	startContainer() {
		spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
		const mockRouting = this.sandbox
			? []
			: [
					'--add-host',
					'sandbox-api.paddle.com:host-gateway',
					'-e',
					'NODE_TLS_REJECT_UNAUTHORIZED=0',
				];
		docker(
			'run',
			'-d',
			'--name',
			CONTAINER,
			'-p',
			`127.0.0.1:${PORT}:5678`,
			...mockRouting,
			'-v',
			`${this.work}:/e2e:ro`,
			'-e',
			`N8N_WEBHOOK_URL=${N8N_URL}/`,
			'-e',
			'N8N_ENCRYPTION_KEY=paddle-n8n-e2e',
			'-e',
			'N8N_DIAGNOSTICS_ENABLED=false',
			'-e',
			'N8N_VERSION_NOTIFICATIONS_ENABLED=false',
			'-e',
			'N8N_TEMPLATES_ENABLED=false',
			'-e',
			'N8N_LOG_LEVEL=warn',
			'-e',
			'GENERIC_TIMEZONE=UTC',
			'-e',
			'TZ=UTC',
			IMAGE,
		);
	}

	installPackage() {
		inContainer(
			`mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes && npm install --omit=peer --no-audit --no-fund --loglevel=error /e2e/pkg/${this.tarball}`,
		);
		docker('restart', CONTAINER);
	}

	// /healthz answers before the REST router is mounted, so wait for a real route.
	async waitForN8n(timeoutMs = 120_000) {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			try {
				const res = await fetch(`${N8N_URL}/rest/settings`);
				if (res.ok) return;
			} catch {}
			await new Promise((r) => setTimeout(r, 1000));
		}
		throw new Error(`n8n did not become healthy:\n${docker('logs', '--tail', '50', CONTAINER)}`);
	}

	async rest(method, route, body) {
		const res = await fetch(`${N8N_URL}/rest${route}`, {
			method,
			headers: { 'Content-Type': 'application/json', Cookie: this.cookie },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		const setCookie = res.headers.get('set-cookie');
		if (setCookie) this.cookie = setCookie.split(';')[0];
		const text = await res.text();
		if (!res.ok) throw new Error(`${method} ${route} -> ${res.status}: ${text}`);
		return text ? JSON.parse(text) : undefined;
	}

	async setupOwner() {
		await this.rest('POST', '/owner/setup', {
			email: 'e2e@example.com',
			firstName: 'E2E',
			lastName: 'Test',
			password: 'E2ePassword123',
		});
	}

	importCredentials() {
		const file = path.join(this.work, 'credentials.json');
		fs.writeFileSync(
			file,
			JSON.stringify(
				(this.sandbox
					? [{ ...CREDENTIALS.good, apiKey: this.sandbox.apiKey }, CREDENTIALS.wrong]
					: Object.values(CREDENTIALS)
				).map((c) => ({
					id: c.id,
					name: c.name,
					type: 'paddleBillingApi',
					data: { apiKey: c.apiKey, environment: 'sandbox' },
				})),
			),
		);
		inContainer('n8n import:credentials --input=/e2e/credentials.json >/dev/null');
	}

	importWorkflow(workflow) {
		const id = `e2e${String(++this.workflowCount).padStart(4, '0')}`;
		const file = path.join(this.work, `${id}.json`);
		fs.writeFileSync(
			file,
			JSON.stringify({ id, active: false, settings: { executionOrder: 'v1' }, ...workflow }),
		);
		inContainer(`n8n import:workflow --input=/e2e/${id}.json >/dev/null`);
		return id;
	}

	paddleNode(parameters, { credential = 'good', onError } = {}) {
		const cred = CREDENTIALS[credential];
		return {
			id: randomUUID(),
			name: 'Paddle Billing',
			type: NODE_TYPE,
			typeVersion: 1,
			position: [500, 0],
			parameters,
			credentials: { paddleBillingApi: { id: cred.id, name: cred.name } },
			...(onError ? { onError } : {}),
		};
	}

	// `inputItems` feeds several items through the node via Set + Split Out.
	// Must stay async: the mock serves n8n's requests from this same event loop.
	async execute(
		name,
		parameters,
		{ credential, onError = 'continueRegularOutput', inputItems } = {},
	) {
		const trigger = {
			id: randomUUID(),
			name: 'Start',
			type: 'n8n-nodes-base.manualTrigger',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		};
		const nodes = [trigger];
		const connections = {};
		let previous = trigger;
		if (inputItems) {
			const set = {
				id: randomUUID(),
				name: 'Items',
				type: 'n8n-nodes-base.set',
				typeVersion: 3.4,
				position: [200, 0],
				parameters: { mode: 'raw', jsonOutput: JSON.stringify({ items: inputItems }), options: {} },
			};
			const split = {
				id: randomUUID(),
				name: 'Split',
				type: 'n8n-nodes-base.splitOut',
				typeVersion: 1,
				position: [350, 0],
				parameters: { fieldToSplitOut: 'items', options: {} },
			};
			nodes.push(set, split);
			connections[previous.name] = { main: [[{ node: set.name, type: 'main', index: 0 }]] };
			connections[set.name] = { main: [[{ node: split.name, type: 'main', index: 0 }]] };
			previous = split;
		}
		const paddle = this.paddleNode(parameters, { credential, onError });
		nodes.push(paddle);
		connections[previous.name] = { main: [[{ node: paddle.name, type: 'main', index: 0 }]] };

		const id = this.importWorkflow({ name, nodes, connections });
		if (this.mock) this.mock.requests.length = 0;
		// The CLI starts its own task broker, which must not collide with the server's.
		const result = await promisify(execFile)(
			'docker',
			[
				'exec',
				'-e',
				'N8N_RUNNERS_BROKER_PORT=5680',
				'-e',
				'N8N_LOG_LEVEL=info',
				CONTAINER,
				'n8n',
				'execute',
				`--id=${id}`,
				'--rawOutput',
			],
			{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
		).catch((error) => error);
		const requests = this.mock ? [...this.mock.requests] : [];
		const stdout = result.stdout ?? '';
		const jsonStart = stdout.search(/^\{$/m);
		const jsonEnd = stdout.lastIndexOf('\n}');
		let execution;
		try {
			execution = JSON.parse(stdout.slice(jsonStart, jsonEnd + 2));
		} catch {
			throw new Error(
				`Could not parse n8n execute output for "${name}":\n${stdout}\n${result.stderr}`,
			);
		}
		const run = execution?.data?.resultData?.runData?.[paddle.name]?.at(-1);
		const items = run?.data?.main?.[0] ?? [];
		return {
			items,
			json: items.map((i) => i.json),
			error: run?.error ?? execution?.data?.resultData?.error,
			requests,
			raw: execution,
		};
	}

	// The trigger feeds Customer > Get, so the mock sees a request whenever it fires.
	importTriggerWorkflow(name, { events, includeSimulations = false, credential = 'good' } = {}) {
		const cred = CREDENTIALS[credential];
		const trigger = {
			id: randomUUID(),
			name: 'Paddle Billing Trigger',
			type: TRIGGER_TYPE,
			typeVersion: 1,
			position: [0, 0],
			webhookId: randomUUID(),
			parameters: { events, options: includeSimulations ? { includeSimulations: true } : {} },
			credentials: { paddleBillingApi: { id: cred.id, name: cred.name } },
		};
		const paddle = this.paddleNode(
			{
				resource: 'customer',
				operation: 'get',
				customerId: { __rl: true, mode: 'id', value: '={{ $json.data.id }}' },
			},
			{ credential, onError: 'continueRegularOutput' },
		);
		const connections = {
			[trigger.name]: { main: [[{ node: paddle.name, type: 'main', index: 0 }]] },
		};
		return this.importWorkflow({ name, nodes: [trigger, paddle], connections });
	}

	async activate(id) {
		const { data } = await this.rest('GET', `/workflows/${id}`);
		return this.rest('POST', `/workflows/${id}/activate`, { versionId: data.versionId });
	}

	async deactivate(id) {
		return this.rest('POST', `/workflows/${id}/deactivate`, {});
	}

	// Every record of a real sandbox list endpoint, walked page by page.
	async paddleListAll(route, perPage = 200) {
		const ids = [];
		let after = '';
		for (;;) {
			const { data, meta } = await this.paddleApi('GET', `${route}?per_page=${perPage}${after}`);
			ids.push(...data.map((r) => r.id));
			if (!meta.pagination.has_more || !data.length) return ids;
			after = `&after=${data[data.length - 1].id}`;
		}
	}

	signedPost(destination, secret, payload, { ts = Math.floor(Date.now() / 1000), signature } = {}) {
		const body = JSON.stringify(payload);
		const h1 = signature ?? createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex');
		const url = destination.replace(/^https?:\/\/[^/]+/, N8N_URL);
		return fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Paddle-Signature': `ts=${ts};h1=${h1}` },
			body,
		});
	}

	logs() {
		return docker('logs', '--tail', '200', CONTAINER);
	}

	async stop() {
		if (process.env.E2E_KEEP) {
			console.log(
				`E2E_KEEP set: leaving container ${CONTAINER} running on ${N8N_URL} (owner e2e@example.com / E2ePassword123)` +
					(this.mock ? ' and the mock Paddle API listening on port 443; Ctrl+C to stop' : ''),
			);
			if (this.mock) await new Promise(() => {});
			return;
		}
		this.mock?.server.closeAllConnections();
		this.mock?.server.close();
		spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
		fs.rmSync(this.work, { recursive: true, force: true });
	}
}
