const { test } = require('node:test');
const assert = require('node:assert');
const { createHmac } = require('node:crypto');
const { PaddleTrigger } = require('../dist/nodes/PaddleTrigger/PaddleTrigger.node');
const { PADDLE_EVENTS } = require('../dist/nodes/PaddleTrigger/events');

const node = {
	name: 'Paddle Billing Trigger',
	type: 'paddleTrigger',
	typeVersion: 1,
	parameters: {},
};
const WEBHOOK_URL = 'https://n8n.test/webhook/abc/webhook';
const EVENT_TYPES = ['transaction.completed', 'customer.created', 'subscription.created'];

const setting = (overrides = {}) => ({
	id: 'ntfset_1',
	destination: WEBHOOK_URL,
	active: true,
	traffic_source: 'platform',
	subscribed_events: [{ name: 'customer.created' }, { name: 'subscription.created' }],
	endpoint_secret_key: 'pdl_ntfset_secret',
	...overrides,
});

// Scripted Paddle API: `settings` is the list returned by GET /notification-settings,
// `byId` maps an ID to the body of GET /notification-settings/{id} (or a status code).
function fakeContext({
	params = { events: ['subscription.created', 'customer.created'] },
	staticData = {},
	settings = [],
	byId = {},
	deleteStatus = 200,
	workflowName = 'Billing alerts',
} = {}) {
	const calls = [];
	return {
		calls,
		staticData,
		getNode: () => node,
		getNodeWebhookUrl: () => WEBHOOK_URL,
		getWorkflowStaticData: () => staticData,
		getNodeParameter: (name, fallback) => (name in params ? params[name] : fallback),
		getWorkflow: () => ({ name: workflowName }),
		logger: { debug() {} },
		async getCredentials() {
			return { environment: 'sandbox' };
		},
		helpers: {
			returnJsonArray: (data) => (Array.isArray(data) ? data : [data]).map((json) => ({ json })),
			async httpRequestWithAuthentication(_name, options) {
				const path = options.url.replace('https://sandbox-api.paddle.com', '');
				calls.push({ method: options.method, path, body: options.body, qs: options.qs });
				const ok = (body) => ({ statusCode: 200, body });
				const notFound = { statusCode: 404, body: { error: { code: 'not_found' } } };
				if (options.method === 'GET' && path === '/event-types') {
					return ok({ data: EVENT_TYPES.map((name) => ({ name })) });
				}
				if (options.method === 'GET' && path === '/notification-settings') {
					return ok({ data: settings });
				}
				if (options.method === 'GET' && path.startsWith('/notification-settings/')) {
					const found = byId[path.split('/').pop()];
					return found ? ok({ data: found }) : notFound;
				}
				if (options.method === 'POST' && path === '/notification-settings') {
					return ok({ data: setting({ id: 'ntfset_new', endpoint_secret_key: 'new_secret' }) });
				}
				if (options.method === 'DELETE') {
					return deleteStatus === 200 ? { statusCode: 204, body: '' } : notFound;
				}
				throw new Error(`unexpected request ${options.method} ${path}`);
			},
		},
	};
}

const hooks = new PaddleTrigger().webhookMethods.default;

test('description registers the trigger and lists every event once, with * first', () => {
	const { description } = new PaddleTrigger();
	assert.strictEqual(description.name, 'paddleTrigger');
	assert.deepStrictEqual(description.group, ['trigger']);
	assert.strictEqual(description.webhooks[0].path, 'webhook');
	assert.strictEqual(description.webhooks[0].httpMethod, 'POST');

	const values = description.properties
		.find((p) => p.name === 'events')
		.options.map((o) => o.value);
	assert.strictEqual(values[0], '*');
	assert.strictEqual(new Set(values).size, values.length);
	for (const event of PADDLE_EVENTS) assert.ok(values.includes(event.value), event.value);
});

test('checkExists: nothing stored and no matching destination returns false', async () => {
	const ctx = fakeContext({ settings: [setting({ destination: 'https://other.test' })] });
	assert.strictEqual(await hooks.checkExists.call(ctx), false);
	assert.deepStrictEqual(
		ctx.calls.map((c) => c.path),
		['/notification-settings'],
	);
	assert.deepStrictEqual(ctx.staticData, {});
});

test('checkExists: finds the destination by URL and stores its ID and secret', async () => {
	const ctx = fakeContext({ settings: [setting()] });
	assert.strictEqual(await hooks.checkExists.call(ctx), true);
	assert.strictEqual(ctx.calls[0].qs.per_page, 200);
	assert.deepStrictEqual(ctx.staticData, {
		notificationSettingId: 'ntfset_1',
		endpointSecretKey: 'pdl_ntfset_secret',
	});
});

test('checkExists: looks the stored ID up directly; a 404 clears static data', async () => {
	const stored = { notificationSettingId: 'ntfset_1', endpointSecretKey: 'old' };
	const ctx = fakeContext({ staticData: stored, byId: { ntfset_1: setting() } });
	assert.strictEqual(await hooks.checkExists.call(ctx), true);
	assert.deepStrictEqual(
		ctx.calls.map((c) => c.path),
		['/notification-settings/ntfset_1'],
	);

	const gone = fakeContext({ staticData: { notificationSettingId: 'ntfset_gone' } });
	assert.strictEqual(await hooks.checkExists.call(gone), false);
	assert.deepStrictEqual(gone.staticData, {});
});

test('checkExists: replaces the destination when events, traffic source or active differ', async () => {
	const cases = [
		{ settings: [setting({ subscribed_events: [{ name: 'customer.created' }] })] },
		{
			settings: [setting()],
			params: {
				events: ['customer.created', 'subscription.created'],
				options: { includeSimulations: true },
			},
		},
		{ settings: [setting({ active: false })] },
	];
	for (const options of cases) {
		const ctx = fakeContext(options);
		assert.strictEqual(await hooks.checkExists.call(ctx), false);
		const del = ctx.calls.find((c) => c.method === 'DELETE');
		assert.strictEqual(del.path, '/notification-settings/ntfset_1');
		assert.deepStrictEqual(ctx.staticData, {});
	}
});

test('checkExists: * matches a destination subscribed to every event type', async () => {
	const all = setting({ subscribed_events: EVENT_TYPES.map((name) => ({ name })) });
	const ctx = fakeContext({ params: { events: ['*'] }, settings: [all] });
	assert.strictEqual(await hooks.checkExists.call(ctx), true);
	assert.ok(ctx.calls.some((c) => c.path === '/event-types'));
});

test('create: posts the destination with sorted events and stores the result', async () => {
	const ctx = fakeContext({ workflowName: 'x'.repeat(600) });
	assert.strictEqual(await hooks.create.call(ctx), true);
	const [post] = ctx.calls;
	assert.strictEqual(post.method, 'POST');
	assert.strictEqual(post.path, '/notification-settings');
	assert.strictEqual(post.body.description.length, 500);
	assert.ok(post.body.description.startsWith('n8n: xxx'));
	assert.strictEqual(post.body.destination, WEBHOOK_URL);
	assert.strictEqual(post.body.type, 'url');
	assert.strictEqual(post.body.api_version, 1);
	assert.deepStrictEqual(post.body.subscribed_events, ['customer.created', 'subscription.created']);
	assert.strictEqual(post.body.traffic_source, 'platform');
	assert.deepStrictEqual(ctx.staticData, {
		notificationSettingId: 'ntfset_new',
		endpointSecretKey: 'new_secret',
	});
});

test('create: * expands to every event type, and simulations switch the traffic source', async () => {
	const ctx = fakeContext({
		params: { events: ['*', 'customer.created'], options: { includeSimulations: true } },
	});
	await hooks.create.call(ctx);
	const post = ctx.calls.find((c) => c.method === 'POST');
	assert.deepStrictEqual(post.body.subscribed_events, [...EVENT_TYPES].sort());
	assert.strictEqual(post.body.traffic_source, 'all');
	assert.strictEqual(post.body.description, 'n8n: Billing alerts');
});

test('create: uses a plain description when the workflow has no name', async () => {
	const ctx = fakeContext({ workflowName: '' });
	await hooks.create.call(ctx);
	assert.strictEqual(ctx.calls[0].body.description, 'n8n');
});

test('create: rejects an empty event list without calling Paddle', async () => {
	const ctx = fakeContext({ params: { events: [] } });
	await assert.rejects(hooks.create.call(ctx), (error) => {
		assert.strictEqual(error.constructor.name, 'NodeOperationError');
		assert.match(error.message, /No events selected/);
		return true;
	});
	assert.deepStrictEqual(ctx.calls, []);
});

test('delete: removes the stored destination and tolerates it already being gone', async () => {
	const ctx = fakeContext({
		staticData: { notificationSettingId: 'ntfset_1', endpointSecretKey: 's' },
	});
	assert.strictEqual(await hooks.delete.call(ctx), true);
	assert.deepStrictEqual(ctx.calls, [
		{ method: 'DELETE', path: '/notification-settings/ntfset_1', body: undefined, qs: undefined },
	]);
	assert.deepStrictEqual(ctx.staticData, {});

	const gone = fakeContext({
		staticData: { notificationSettingId: 'ntfset_1' },
		deleteStatus: 404,
	});
	assert.strictEqual(await hooks.delete.call(gone), true);
	assert.deepStrictEqual(gone.staticData, {});

	const nothing = fakeContext();
	assert.strictEqual(await hooks.delete.call(nothing), true);
	assert.deepStrictEqual(nothing.calls, []);
});

// --- webhook() ---

const payload = { event_id: 'evt_1', event_type: 'customer.created', data: { id: 'ctm_1' } };
const rawBody = Buffer.from(JSON.stringify(payload));
const sign = (secret, ts = Math.floor(Date.now() / 1000)) =>
	`ts=${ts};h1=${createHmac('sha256', secret).update(`${ts}:`).update(rawBody).digest('hex')}`;

function webhookContext({ signature, staticData = {}, settings = [], readRaw = false } = {}) {
	const ctx = fakeContext({ staticData, settings });
	const req = {
		rawBody: readRaw ? undefined : rawBody,
		readRawBody: async () => (req.rawBody = rawBody),
	};
	const res = { status: [], sent: [], ended: 0 };
	Object.assign(ctx, {
		response: res,
		getRequestObject: () => req,
		getHeaderData: () => (signature === undefined ? {} : { 'paddle-signature': signature }),
		getBodyData: () => payload,
		getResponseObject: () => ({
			status(code) {
				res.status.push(code);
				return this;
			},
			send(body) {
				res.sent.push(body);
				return this;
			},
			end() {
				res.ended += 1;
				return this;
			},
		}),
	});
	return ctx;
}

const trigger = new PaddleTrigger();

test('webhook: a valid signature yields the notification payload', async () => {
	const ctx = webhookContext({
		signature: sign('s3cret'),
		staticData: { endpointSecretKey: 's3cret' },
	});
	const result = await trigger.webhook.call(ctx);
	assert.deepStrictEqual(result, { workflowData: [[{ json: payload }]] });
	assert.deepStrictEqual(ctx.calls, []);
	assert.strictEqual(ctx.response.ended, 0);
});

test('webhook: reads the raw body when it is not already present', async () => {
	const ctx = webhookContext({
		signature: sign('s3cret'),
		staticData: { endpointSecretKey: 's3cret' },
		readRaw: true,
	});
	const result = await trigger.webhook.call(ctx);
	assert.deepStrictEqual(result.workflowData[0][0].json, payload);
});

test('webhook: missing, wrong-secret and stale signatures get a 401', async () => {
	for (const signature of [
		undefined,
		sign('other'),
		sign('s3cret', Math.floor(Date.now() / 1000) - 600),
	]) {
		const ctx = webhookContext({ signature, staticData: { endpointSecretKey: 's3cret' } });
		assert.deepStrictEqual(await trigger.webhook.call(ctx), { noWebhookResponse: true });
		assert.deepStrictEqual(ctx.response.status, [401]);
		assert.strictEqual(ctx.response.ended, 1);
	}
});

test('webhook: looks the secret up by destination when static data has none', async () => {
	const ctx = webhookContext({
		signature: sign('pdl_ntfset_secret'),
		settings: [setting({ destination: 'https://other.test', endpoint_secret_key: 'x' }), setting()],
	});
	const result = await trigger.webhook.call(ctx);
	assert.deepStrictEqual(result.workflowData[0][0].json, payload);
	assert.deepStrictEqual(
		ctx.calls.map((c) => c.path),
		['/notification-settings'],
	);

	const unknown = webhookContext({ signature: sign('pdl_ntfset_secret') });
	assert.deepStrictEqual(await trigger.webhook.call(unknown), { noWebhookResponse: true });
	assert.deepStrictEqual(unknown.response.status, [401]);
});

test('webhook: uses the first value of a repeated signature header', async () => {
	const ctx = webhookContext({
		signature: [sign('s3cret'), 'garbage'],
		staticData: { endpointSecretKey: 's3cret' },
	});
	const result = await trigger.webhook.call(ctx);
	assert.deepStrictEqual(result.workflowData[0][0].json, payload);
});
