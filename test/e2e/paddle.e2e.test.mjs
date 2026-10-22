// End-to-end: the packed package inside the official n8n image, talking to mock-paddle.
// Requires Docker. Run with `pnpm test:e2e`; set E2E_KEEP=1 to leave n8n running afterwards.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_TYPES } from './mock-paddle.mjs';
import { errorOf, Harness, N8N_URL, rl } from './harness.mjs';

const SIMPLIFIED_PRODUCT_KEYS = [
	'id',
	'name',
	'description',
	'type',
	'tax_category',
	'image_url',
	'custom_data',
	'status',
	'created_at',
	'updated_at',
];

let h;
before(async () => {
	h = new Harness();
	await h.start();
});
after(async () => {
	await h?.stop();
});

const waitFor = async (predicate, timeoutMs = 15_000) => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return true;
		await new Promise((r) => setTimeout(r, 250));
	}
	return false;
};

describe('Customer', () => {
	test('Get Many with Return All pages through every result and keeps filters and sort', async () => {
		const r = await h.execute('customer return all', {
			resource: 'customer',
			operation: 'getAll',
			returnAll: true,
			filters: { status: ['active'] },
			sort: { direction: 'DESC' },
		});
		assert.equal(r.json.length, 405);
		assert.equal(r.json[0].id, 'ctm_01e2e000449');
		assert.equal(r.requests.length, 3);
		for (const q of r.requests) {
			assert.equal(q.path, '/customers');
			assert.equal(q.query.per_page, '200');
			assert.equal(q.query.status, 'active');
			assert.equal(q.query.order_by, 'id[DESC]');
		}
		assert.equal(r.requests[0].query.after, undefined);
		assert.equal(r.requests[1].query.after, r.json[199].id);
		assert.equal(r.requests[2].query.after, r.json[399].id);
	});

	test('Limit above the page cap is fetched over several pages', async () => {
		const r = await h.execute('customer limit 250', {
			resource: 'customer',
			operation: 'getAll',
			limit: 250,
		});
		assert.equal(r.json.length, 250);
		assert.equal(r.requests.length, 2);
		assert.equal(r.requests[0].query.per_page, '200');
	});

	test('Limit below the page cap sends one request', async () => {
		const r = await h.execute('customer limit 5', {
			resource: 'customer',
			operation: 'getAll',
			limit: 5,
		});
		assert.equal(r.json.length, 5);
		assert.equal(r.requests.length, 1);
		assert.equal(r.requests[0].query.per_page, '5');
	});

	test('filters are sent as comma-separated query params', async () => {
		const r = await h.execute('customer filters', {
			resource: 'customer',
			operation: 'getAll',
			limit: 50,
			filters: {
				ids: ' ctm_01e2e000001 , ctm_01e2e000002 ',
				search: 'customer',
				email: 'customer1@example.com,customer2@example.com',
			},
		});
		assert.equal(r.requests[0].query.id, 'ctm_01e2e000001,ctm_01e2e000002');
		assert.equal(r.requests[0].query.search, 'customer');
		assert.equal(r.requests[0].query.email, 'customer1@example.com,customer2@example.com');
		assert.deepEqual(r.json.map((c) => c.id).sort(), ['ctm_01e2e000001', 'ctm_01e2e000002']);
	});

	test('Get by ID unwraps the data envelope', async () => {
		const r = await h.execute('customer get', {
			resource: 'customer',
			operation: 'get',
			customerId: rl('ctm_01e2e000001'),
		});
		assert.equal(r.requests[0].method, 'GET');
		assert.equal(r.requests[0].path, '/customers/ctm_01e2e000001');
		assert.equal(r.requests[0].headers['paddle-version'], '1');
		assert.equal(r.requests[0].headers.authorization, 'Bearer ***');
		assert.equal(r.json.length, 1);
		assert.equal(r.json[0].email, 'customer1@example.com');
	});

	test('Create sends email and additional fields, with Custom Data parsed as JSON', async () => {
		const r = await h.execute('customer create', {
			resource: 'customer',
			operation: 'create',
			email: 'new@example.com',
			additionalFields: { name: 'New Customer', locale: 'fr', customData: '{"plan":"pro"}' },
		});
		assert.equal(r.requests[0].method, 'POST');
		assert.equal(r.requests[0].path, '/customers');
		assert.deepEqual(r.requests[0].body, {
			email: 'new@example.com',
			name: 'New Customer',
			locale: 'fr',
			custom_data: { plan: 'pro' },
		});
		assert.match(r.json[0].id, /^ctm_/);
	});

	test('Update sends only the chosen fields', async () => {
		const r = await h.execute('customer update', {
			resource: 'customer',
			operation: 'update',
			customerId: rl('ctm_01e2e000002'),
			updateFields: { email: 'changed@example.com', status: 'archived' },
		});
		assert.equal(r.requests[0].method, 'PATCH');
		assert.equal(r.requests[0].path, '/customers/ctm_01e2e000002');
		assert.deepEqual(r.requests[0].body, { email: 'changed@example.com', status: 'archived' });
		assert.equal(r.json[0].email, 'changed@example.com');
	});

	test('Archive patches the status', async () => {
		const r = await h.execute('customer archive', {
			resource: 'customer',
			operation: 'archive',
			customerId: rl('ctm_01e2e000003'),
		});
		assert.equal(r.requests[0].method, 'PATCH');
		assert.deepEqual(r.requests[0].body, { status: 'archived' });
		assert.equal(r.json[0].status, 'archived');
	});

	test('several input items make one request each and errors stay with their item', async () => {
		const r = await h.execute(
			'customer multi item',
			{ resource: 'customer', operation: 'get', customerId: rl('={{ $json.items }}') },
			{ inputItems: ['ctm_01e2e000001', 'ctm_01e2e999404', 'ctm_01e2e000005'] },
		);
		assert.equal(r.requests.length, 3);
		assert.equal(r.json.length, 3);
		assert.equal(r.json[0].id, 'ctm_01e2e000001');
		assert.match(errorOf(r.items[1]), /Paddle couldn't find the requested record \[item 1\]/);
		assert.equal(r.json[2].id, 'ctm_01e2e000005');
	});
});

describe('Errors', () => {
	test('404 explains the record was not found', async () => {
		const r = await h.execute('error 404', {
			resource: 'customer',
			operation: 'get',
			customerId: rl('ctm_01e2e999404'),
		});
		assert.match(errorOf(r.items[0]), /Paddle couldn't find the requested record/);
	});

	test('400 names the rejected parameter and includes the request ID', async () => {
		const r = await h.execute(
			'error 400',
			{ resource: 'customer', operation: 'create', email: 'invalid', additionalFields: {} },
			{ onError: 'stopWorkflow' },
		);
		assert.equal(r.raw.status, 'error');
		assert.equal(r.error.message, "Paddle rejected the value of 'Email' [item 0]");
		assert.match(r.error.description, /'Email': must be a valid email address/);
		assert.match(r.error.description, /Paddle request ID: req_/);
	});

	test('403 points at the API key permissions', async () => {
		const r = await h.execute(
			'error 403',
			{ resource: 'customer', operation: 'get', customerId: rl('ctm_01e2e000001') },
			{ credential: 'forbidden' },
		);
		assert.match(errorOf(r.items[0]), /The API key doesn't have permission for this action/);
	});

	test('a rejected API key is reported as an API key problem', async () => {
		const r = await h.execute(
			'error bad key',
			{ resource: 'customer', operation: 'get', customerId: rl('ctm_01e2e000001') },
			{ credential: 'wrong' },
		);
		// Paddle sends 403 authentication_malformed; the exact wording is the node's call.
		assert.match(errorOf(r.items[0]), /API key/);
	});

	test('429 and 5xx get their own messages', async () => {
		const limited = await h.execute('error 429', {
			resource: 'customer',
			operation: 'create',
			email: 'rate@limit.example',
			additionalFields: {},
		});
		assert.match(
			errorOf(limited.items[0]),
			/Paddle is limiting how many requests this workflow sends/,
		);
		const down = await h.execute('error 500', {
			resource: 'customer',
			operation: 'create',
			email: 'server@error.example',
			additionalFields: {},
		});
		assert.match(errorOf(down.items[0]), /Paddle is temporarily unavailable/);
	});
});

describe('Product', () => {
	test('Create sends name, tax category and additional fields', async () => {
		const r = await h.execute('product create', {
			resource: 'product',
			operation: 'create',
			name: 'Widget',
			taxCategory: 'saas',
			additionalFields: {
				description: 'A widget',
				imageUrl: 'https://example.com/w.png',
				type: 'custom',
				customData: '{"sku":"W1"}',
			},
		});
		assert.deepEqual(r.requests[0].body, {
			name: 'Widget',
			tax_category: 'saas',
			description: 'A widget',
			image_url: 'https://example.com/w.png',
			type: 'custom',
			custom_data: { sku: 'W1' },
		});
	});

	test('Get simplifies to 10 fields by default', async () => {
		const r = await h.execute('product get simplified', {
			resource: 'product',
			operation: 'get',
			productId: rl('pro_01e2e000001'),
		});
		assert.deepEqual(Object.keys(r.json[0]), SIMPLIFIED_PRODUCT_KEYS);
		assert.equal('include' in r.requests[0].query, false);
	});

	test('Include Prices adds include=prices and Simplify off returns the raw record', async () => {
		const r = await h.execute('product get include prices', {
			resource: 'product',
			operation: 'get',
			productId: rl('pro_01e2e000001'),
			simplify: false,
			options: { includePrices: true },
		});
		assert.equal(r.requests[0].query.include, 'prices');
		assert.equal(r.json[0].id, 'pro_01e2e000001');
	});

	test('Get Many sorts by field and filters by tax category and type', async () => {
		const r = await h.execute('product getAll sorted', {
			resource: 'product',
			operation: 'getAll',
			limit: 3,
			filters: { taxCategory: ['saas', 'standard'], type: 'standard', includePrices: true },
			sort: { field: 'name', direction: 'ASC' },
		});
		assert.equal(r.requests[0].query.order_by, 'name[ASC]');
		assert.equal(r.requests[0].query.tax_category, 'saas,standard');
		assert.equal(r.requests[0].query.type, 'standard');
		assert.equal(r.requests[0].query.include, 'prices');
		assert.deepEqual(
			r.json.map((p) => p.name),
			['Product 1', 'Product 2', 'Product 3'],
		);
	});
});

describe('Price', () => {
	test('Create nests unit price, billing cycle, trial period and quantity', async () => {
		const r = await h.execute('price create', {
			resource: 'price',
			operation: 'create',
			productId: rl('pro_01e2e000001'),
			description: 'Monthly plan',
			unitPriceAmount: '1500',
			currencyCode: 'EUR',
			additionalFields: {
				billingCycle: { cycle: { frequency: 1, interval: 'month' } },
				trialPeriod: { trial: { frequency: 14, interval: 'day', requires_payment_method: false } },
				quantity: { limits: { maximum: 10, minimum: 1 } },
				taxMode: 'external',
				type: 'standard',
				name: 'Monthly',
				customData: '{"tier":"a"}',
			},
		});
		assert.equal(r.requests[0].path, '/prices');
		assert.deepEqual(r.requests[0].body, {
			product_id: 'pro_01e2e000001',
			description: 'Monthly plan',
			unit_price: { amount: '1500', currency_code: 'EUR' },
			billing_cycle: { frequency: 1, interval: 'month' },
			trial_period: { frequency: 14, interval: 'day', requires_payment_method: false },
			quantity: { maximum: 10, minimum: 1 },
			tax_mode: 'external',
			type: 'standard',
			name: 'Monthly',
			custom_data: { tier: 'a' },
		});
	});

	test('Update sends the unit price object and status', async () => {
		const r = await h.execute('price update', {
			resource: 'price',
			operation: 'update',
			priceId: rl('pri_01e2e000001'),
			updateFields: {
				unitPrice: { price: { amount: '2000', currency_code: 'USD' } },
				status: 'archived',
				description: 'Renamed',
			},
		});
		assert.equal(r.requests[0].method, 'PATCH');
		assert.equal(r.requests[0].path, '/prices/pri_01e2e000001');
		assert.deepEqual(r.requests[0].body, {
			unit_price: { amount: '2000', currency_code: 'USD' },
			status: 'archived',
			description: 'Renamed',
		});
	});

	test('Get flattens the amount and billing cycle', async () => {
		const r = await h.execute('price get', {
			resource: 'price',
			operation: 'get',
			priceId: rl('pri_01e2e000002'),
		});
		assert.equal(r.json[0].amount, '2000');
		assert.equal(r.json[0].currency_code, 'USD');
		assert.equal(r.json[0].billing_interval, 'month');
		assert.equal(r.json[0].unit_price, undefined);
	});

	test('Get Many filters by recurring and product', async () => {
		const r = await h.execute('price getAll filters', {
			resource: 'price',
			operation: 'getAll',
			limit: 50,
			filters: { recurring: false, productIds: 'pro_01e2e000002', status: ['active'] },
		});
		assert.equal(r.requests[0].query.recurring, 'false');
		assert.equal(r.requests[0].query.product_id, 'pro_01e2e000002');
		assert.equal(r.requests[0].query.status, 'active');
		assert.ok(r.json.every((p) => p.product_id === 'pro_01e2e000002'));
	});
});

describe('Discount', () => {
	test('Create sends every field with Restrict To as an array and Expires At as RFC 3339', async () => {
		const r = await h.execute('discount create', {
			resource: 'discount',
			operation: 'create',
			description: 'Five off',
			type: 'flat',
			amount: '500',
			additionalFields: {
				currencyCode: 'USD',
				code: 'SAVE5',
				expiresAt: '2026-12-31T00:00:00.000Z',
				restrictTo: 'pro_01e2e000001, pri_01e2e000002',
				recur: true,
				maximumRecurringIntervals: 3,
				usageLimit: 10,
				enabledForCheckout: false,
				customData: '{}',
			},
		});
		assert.deepEqual(r.requests[0].body, {
			description: 'Five off',
			type: 'flat',
			amount: '500',
			currency_code: 'USD',
			code: 'SAVE5',
			expires_at: '2026-12-31T00:00:00.000Z',
			restrict_to: ['pro_01e2e000001', 'pri_01e2e000002'],
			recur: true,
			maximum_recurring_intervals: 3,
			usage_limit: 10,
			enabled_for_checkout: false,
			custom_data: {},
		});
	});

	test('Get Many filters by code and simplifies', async () => {
		const r = await h.execute('discount getAll codes', {
			resource: 'discount',
			operation: 'getAll',
			limit: 50,
			filters: { codes: 'CODE2, CODE3' },
		});
		assert.equal(r.requests[0].query.code, 'CODE2,CODE3');
		assert.deepEqual(r.json.map((d) => d.code).sort(), ['CODE2', 'CODE3']);
		assert.ok(Object.keys(r.json[0]).length <= 10);
	});

	test('Archive patches the status', async () => {
		const r = await h.execute('discount archive', {
			resource: 'discount',
			operation: 'archive',
			discountId: rl('dsc_01e2e000003'),
		});
		assert.deepEqual(r.requests[0].body, { status: 'archived' });
	});
});

describe('Subscription', () => {
	test('Get sends include and flattens the billing cycle and price IDs', async () => {
		const r = await h.execute('subscription get', {
			resource: 'subscription',
			operation: 'get',
			subscriptionId: rl('sub_01e2e000001'),
			getOptions: { include: ['next_transaction', 'recurring_transaction_details'] },
		});
		assert.equal(r.requests[0].query.include, 'next_transaction,recurring_transaction_details');
		assert.equal(r.json[0].billing_interval, 'month');
		assert.deepEqual(r.json[0].price_ids, ['pri_01e2e000001', 'pri_01e2e000002']);
		assert.equal(r.json[0].scheduled_change, null);
	});

	test('Cancel posts effective_from', async () => {
		const r = await h.execute('subscription cancel', {
			resource: 'subscription',
			operation: 'cancel',
			subscriptionId: rl('sub_01e2e000001'),
			effectiveFrom: 'next_billing_period',
		});
		assert.equal(r.requests[0].method, 'POST');
		assert.equal(r.requests[0].path, '/subscriptions/sub_01e2e000001/cancel');
		assert.deepEqual(r.requests[0].body, { effective_from: 'next_billing_period' });
		assert.deepEqual(
			r.json[0].scheduled_change,
			{ action: 'cancel' },
			'Cancel returns the raw record',
		);
	});

	test('Pause posts effective_from, resume_at and on_resume', async () => {
		const r = await h.execute('subscription pause', {
			resource: 'subscription',
			operation: 'pause',
			subscriptionId: rl('sub_01e2e000002'),
			effectiveFrom: 'immediately',
			pauseOptions: {
				resumeAt: '2026-11-01T00:00:00.000Z',
				onResume: 'continue_existing_billing_period',
			},
		});
		assert.equal(r.requests[0].path, '/subscriptions/sub_01e2e000002/pause');
		assert.deepEqual(r.requests[0].body, {
			effective_from: 'immediately',
			resume_at: '2026-11-01T00:00:00.000Z',
			on_resume: 'continue_existing_billing_period',
		});
	});

	test('Resume immediately sends effective_from=immediately', async () => {
		const r = await h.execute('subscription resume now', {
			resource: 'subscription',
			operation: 'resume',
			subscriptionId: rl('sub_01e2e000002'),
			resumeWhen: 'immediately',
			resumeOptions: {},
		});
		assert.equal(r.requests[0].path, '/subscriptions/sub_01e2e000002/resume');
		assert.deepEqual(r.requests[0].body, { effective_from: 'immediately' });
	});

	test('Resume on a date sends the date as effective_from', async () => {
		const r = await h.execute('subscription resume date', {
			resource: 'subscription',
			operation: 'resume',
			subscriptionId: rl('sub_01e2e000002'),
			resumeWhen: 'onDate',
			resumeAt: '2026-11-05T12:00:00.000Z',
			resumeOptions: { onResume: 'start_new_billing_period' },
		});
		assert.deepEqual(r.requests[0].body, {
			effective_from: '2026-11-05T12:00:00.000Z',
			on_resume: 'start_new_billing_period',
		});
	});

	test('Get Many filters by several statuses and collection mode', async () => {
		const r = await h.execute('subscription getAll', {
			resource: 'subscription',
			operation: 'getAll',
			returnAll: true,
			filters: {
				status: ['active', 'past_due'],
				collectionMode: 'automatic',
				scheduledChangeAction: ['cancel', 'pause'],
			},
		});
		assert.equal(r.requests[0].query.status, 'active,past_due');
		assert.equal(r.requests[0].query.collection_mode, 'automatic');
		assert.equal(r.requests[0].query.scheduled_change_action, 'cancel,pause');
	});
});

describe('Transaction', () => {
	test('Create maps items and additional fields', async () => {
		const r = await h.execute('transaction create', {
			resource: 'transaction',
			operation: 'create',
			items: {
				item: [
					{ priceId: 'pri_01e2e000001', quantity: 2 },
					{ priceId: 'pri_01e2e000002', quantity: 1 },
				],
			},
			additionalFields: {
				customerId: 'ctm_01e2e000001',
				currencyCode: 'GBP',
				collectionMode: 'manual',
				discountId: 'dsc_01e2e000002',
				addressId: 'add_01e2e000001',
				businessId: 'biz_01e2e000001',
				customData: '{"order":"42"}',
			},
		});
		assert.equal(r.requests[0].path, '/transactions');
		assert.deepEqual(r.requests[0].body, {
			items: [
				{ price_id: 'pri_01e2e000001', quantity: 2 },
				{ price_id: 'pri_01e2e000002', quantity: 1 },
			],
			customer_id: 'ctm_01e2e000001',
			currency_code: 'GBP',
			collection_mode: 'manual',
			discount_id: 'dsc_01e2e000002',
			address_id: 'add_01e2e000001',
			business_id: 'biz_01e2e000001',
			custom_data: { order: '42' },
		});
	});

	test('Return All pages at the 30-record cap', async () => {
		const r = await h.execute('transaction return all', {
			resource: 'transaction',
			operation: 'getAll',
			returnAll: true,
		});
		assert.equal(r.json.length, h.mock.db.transactions.size);
		assert.equal(r.requests.length, 3);
		assert.ok(r.requests.every((q) => q.query.per_page === '30'));
		assert.equal(r.requests[1].query.after, r.json[29].id);
	});

	test('Limit 45 stops after the second page', async () => {
		const r = await h.execute('transaction limit 45', {
			resource: 'transaction',
			operation: 'getAll',
			limit: 45,
		});
		assert.equal(r.json.length, 45);
		assert.equal(r.requests.length, 2);
		assert.equal(r.requests[0].query.per_page, '30');
	});

	test('Get flattens the grand total and can include related entities', async () => {
		const simplified = await h.execute('transaction get', {
			resource: 'transaction',
			operation: 'get',
			transactionId: rl('txn_01e2e000001'),
		});
		assert.equal(simplified.json[0].total, '100');
		assert.equal(simplified.json[0].invoice_number, 'INV-1');
		assert.equal(simplified.json[0].details, undefined);

		const raw = await h.execute('transaction get include', {
			resource: 'transaction',
			operation: 'get',
			transactionId: rl('txn_01e2e000001'),
			simplify: false,
			getOptions: { include: ['customer', 'address'] },
		});
		assert.equal(raw.requests[0].query.include, 'customer,address');
		assert.deepEqual(raw.json[0].details, { totals: { grand_total: '100' } });
	});

	test('Get Many sorts by billed_at and filters by invoice number and subscription', async () => {
		const r = await h.execute('transaction getAll filters', {
			resource: 'transaction',
			operation: 'getAll',
			limit: 10,
			filters: {
				invoiceNumbers: 'INV-1,INV-2',
				subscriptionIds: 'sub_01e2e000002',
				status: ['completed'],
			},
			sort: { field: 'billed_at', direction: 'DESC' },
		});
		assert.equal(r.requests[0].query.order_by, 'billed_at[DESC]');
		assert.equal(r.requests[0].query.invoice_number, 'INV-1,INV-2');
		assert.equal(r.requests[0].query.subscription_id, 'sub_01e2e000002');
		assert.deepEqual(
			r.json.map((t) => t.id),
			['txn_01e2e000001'],
		);
	});
});

describe('Paddle Billing Trigger', () => {
	let workflowId;
	let setting;

	test('activating creates a notification destination for the chosen events', async () => {
		workflowId = h.importTriggerWorkflow('trigger basic', {
			events: ['subscription.canceled', 'customer.created'],
			includeSimulations: true,
		});
		h.mock.requests.length = 0;
		await h.activate(workflowId);
		// n8n answers the activate call before the webhook create hook has finished.
		assert.ok(
			await waitFor(() => h.mock.requests.some((q) => q.method === 'POST')),
			`no destination created:\n${h.logs()}`,
		);

		const calls = h.mock.requests.map((q) => `${q.method} ${q.path}`);
		assert.deepEqual(calls, ['GET /notification-settings', 'POST /notification-settings']);
		const created = h.mock.requests[1].body;
		assert.equal(created.description, 'n8n: trigger basic');
		assert.ok(created.destination.startsWith(`${N8N_URL}/webhook/`), created.destination);
		assert.equal(created.type, 'url');
		assert.equal(created.api_version, 1);
		assert.deepEqual(created.subscribed_events, ['customer.created', 'subscription.canceled']);
		assert.equal(created.traffic_source, 'all');

		const settings = [...h.mock.db['notification-settings'].values()];
		assert.equal(settings.length, 1);
		setting = settings[0];
	});

	test('a correctly signed event runs the workflow with the payload', async () => {
		assert.ok(setting, 'needs the destination from the activation test');
		h.mock.requests.length = 0;
		const res = await h.signedPost(setting.destination, setting.endpoint_secret_key, {
			event_id: 'evt_01e2e',
			event_type: 'customer.created',
			occurred_at: '2026-10-21T00:00:00Z',
			notification_id: 'ntf_01e2e',
			data: { id: 'ctm_01e2e000007' },
		});
		assert.equal(res.status, 200);
		const ran = await waitFor(() =>
			h.mock.requests.some((q) => q.path === '/customers/ctm_01e2e000007'),
		);
		assert.ok(ran, `workflow did not run:\n${h.logs()}`);
	});

	test('invalid, stale or missing signatures are rejected with 401', async () => {
		assert.ok(setting, 'needs the destination from the activation test');
		h.mock.requests.length = 0;
		const payload = { event_type: 'customer.created', data: { id: 'ctm_01e2e000008' } };
		const bad = await h.signedPost(setting.destination, setting.endpoint_secret_key, payload, {
			signature: 'ab'.repeat(32),
		});
		assert.equal(bad.status, 401);
		assert.equal(await bad.text(), 'Invalid Paddle signature');
		const stale = await h.signedPost(setting.destination, setting.endpoint_secret_key, payload, {
			ts: Math.floor(Date.now() / 1000) - 400,
		});
		assert.equal(stale.status, 401);
		const wrongSecret = await h.signedPost(setting.destination, 'pdl_ntfset_other', payload);
		assert.equal(wrongSecret.status, 401);
		const missing = await fetch(setting.destination.replace(/^https?:\/\/[^/]+/, N8N_URL), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});
		assert.equal(missing.status, 401);
		await new Promise((r) => setTimeout(r, 1000));
		assert.ok(
			!h.mock.requests.some((q) => q.path.startsWith('/customers/')),
			'a rejected event must not run the workflow',
		);
	});

	test('deactivating deletes the notification destination', async () => {
		assert.ok(setting, 'needs the destination from the activation test');
		h.mock.requests.length = 0;
		await h.deactivate(workflowId);
		assert.ok(
			await waitFor(() => h.mock.requests.some((q) => q.method === 'DELETE')),
			'no destination deleted',
		);
		assert.deepEqual(
			h.mock.requests.map((q) => `${q.method} ${q.path}`),
			[`DELETE /notification-settings/${setting.id}`],
		);
		assert.equal(h.mock.db['notification-settings'].size, 0);
	});

	test('"*" subscribes to every event type Paddle offers', async () => {
		const id = h.importTriggerWorkflow('trigger all events', { events: ['*'] });
		h.mock.requests.length = 0;
		await h.activate(id);
		assert.ok(
			await waitFor(() => h.mock.requests.some((q) => q.method === 'POST')),
			'no destination created',
		);
		const created = h.mock.requests.find(
			(q) => q.method === 'POST' && q.path === '/notification-settings',
		);
		assert.ok(h.mock.requests.some((q) => q.path === '/event-types'));
		assert.deepEqual(created.body.subscribed_events, EVENT_TYPES.map((e) => e.name).sort());
		assert.equal(created.body.traffic_source, 'platform');
		await h.deactivate(id);
		assert.ok(
			await waitFor(() => h.mock.db['notification-settings'].size === 0),
			'destination not deleted',
		);
	});

	test('activating with no events is refused', async () => {
		const id = h.importTriggerWorkflow('trigger no events', { events: [] });
		// n8n's own required-parameter check fires before the node's create hook can.
		await assert.rejects(h.activate(id), /required parameters: events|No events selected/);
	});
});
