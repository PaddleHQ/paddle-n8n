// Real Paddle sandbox (PADDLE_SANDBOX_API_KEY). Created records are archived afterwards;
// the one change to an existing record, a scheduled pause/cancel, is reverted straight away.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { errorOf, Harness, rl } from './harness.mjs';

const apiKey = process.env.PADDLE_SANDBOX_API_KEY;
const stamp = Date.now().toString(36);

// The ID of the record a Create returned, failing with the node's message if it didn't.
const createdId = (result, prefix) => {
	assert.ok(result.items.length, 'the node returned no items');
	const id = result.json[0].id ?? errorOf(result.items[0]);
	assert.match(id, prefix);
	return id;
};

describe('Paddle sandbox', { skip: !apiKey && 'PADDLE_SANDBOX_API_KEY not set' }, () => {
	let h;
	const created = {};

	before(async () => {
		h = new Harness({ sandbox: { apiKey } });
		await h.start();
	});
	after(async () => {
		if (!h) return;
		for (const [resource, id] of Object.entries(created)) {
			await h.paddleApi('PATCH', `/${resource}/${id}`, { status: 'archived' }).catch(() => {});
		}
		await h.stop();
	});

	test('Product: create, get, update, list, archive', async () => {
		const create = await h.execute('sb product create', {
			resource: 'product',
			operation: 'create',
			name: `n8n e2e product ${stamp}`,
			taxCategory: 'standard',
			additionalFields: {
				description: 'Created by the n8n e2e suite',
				customData: '{"suite":"n8n-e2e"}',
			},
		});
		createdId(create, /^pro_/);
		created.products = create.json[0].id;
		assert.deepEqual(create.json[0].custom_data, { suite: 'n8n-e2e' });

		const get = await h.execute('sb product get', {
			resource: 'product',
			operation: 'get',
			productId: rl(created.products),
		});
		assert.equal(Object.keys(get.json[0]).length, 10);
		assert.equal(get.json[0].name, `n8n e2e product ${stamp}`);

		const raw = await h.execute('sb product get raw', {
			resource: 'product',
			operation: 'get',
			productId: rl(created.products),
			simplify: false,
			options: { includePrices: true },
		});
		assert.ok(Array.isArray(raw.json[0].prices), 'include=prices returns a prices array');

		const update = await h.execute('sb product update', {
			resource: 'product',
			operation: 'update',
			productId: rl(created.products),
			updateFields: {
				name: `n8n e2e product ${stamp} renamed`,
				imageUrl: 'https://example.com/image.png',
			},
		});
		assert.equal(update.json[0].name, `n8n e2e product ${stamp} renamed`);

		const list = await h.execute('sb product list', {
			resource: 'product',
			operation: 'getAll',
			limit: 10,
			filters: { ids: created.products, status: ['active'] },
			sort: { field: 'name', direction: 'ASC' },
		});
		assert.deepEqual(
			list.json.map((p) => p.id),
			[created.products],
		);
	});

	test('Price: create with billing cycle and trial, get, update, list', async () => {
		const create = await h.execute('sb price create', {
			resource: 'price',
			operation: 'create',
			productId: rl(created.products),
			description: `n8n e2e price ${stamp}`,
			unitPriceAmount: '1000',
			currencyCode: 'USD',
			additionalFields: {
				name: 'Monthly',
				billingCycle: { cycle: { frequency: 1, interval: 'month' } },
				trialPeriod: { trial: { frequency: 7, interval: 'day', requires_payment_method: true } },
				quantity: { limits: { minimum: 1, maximum: 5 } },
				taxMode: 'account_setting',
			},
		});
		createdId(create, /^pri_/);
		created.prices = create.json[0].id;
		assert.equal(create.json[0].unit_price.amount, '1000');
		assert.deepEqual(create.json[0].billing_cycle, { frequency: 1, interval: 'month' });
		assert.equal(create.json[0].trial_period.frequency, 7);
		assert.deepEqual(create.json[0].quantity, { minimum: 1, maximum: 5 });

		const get = await h.execute('sb price get', {
			resource: 'price',
			operation: 'get',
			priceId: rl(created.prices),
		});
		assert.equal(get.json[0].amount, '1000');
		assert.equal(get.json[0].billing_interval, 'month');

		const update = await h.execute('sb price update', {
			resource: 'price',
			operation: 'update',
			priceId: rl(created.prices),
			updateFields: {
				unitPrice: { price: { amount: '2500', currency_code: 'USD' } },
				description: 'n8n e2e price updated',
			},
		});
		assert.equal(update.json[0].unit_price.amount, '2500');

		const list = await h.execute('sb price list', {
			resource: 'price',
			operation: 'getAll',
			limit: 50,
			filters: { productIds: created.products, recurring: true },
		});
		assert.deepEqual(
			list.json.map((p) => p.id),
			[created.prices],
		);
	});

	test('Discount: create, get, update, list by code', async () => {
		const code = `N8NE2E${stamp.toUpperCase()}`.slice(0, 16);
		const create = await h.execute('sb discount create', {
			resource: 'discount',
			operation: 'create',
			description: `n8n e2e discount ${stamp}`,
			type: 'percentage',
			amount: '15',
			additionalFields: {
				code,
				expiresAt: '2027-01-01T00:00:00.000Z',
				restrictTo: created.products,
				usageLimit: 3,
				enabledForCheckout: true,
			},
		});
		createdId(create, /^dsc_/);
		created.discounts = create.json[0].id;
		assert.equal(create.json[0].code, code);
		assert.equal(create.json[0].expires_at, '2027-01-01T00:00:00Z');

		const update = await h.execute('sb discount update', {
			resource: 'discount',
			operation: 'update',
			discountId: rl(created.discounts),
			updateFields: { amount: '20', recur: true, maximumRecurringIntervals: 2 },
		});
		assert.equal(update.json[0].amount, '20');
		assert.equal(update.json[0].recur, true);

		const list = await h.execute('sb discount list', {
			resource: 'discount',
			operation: 'getAll',
			limit: 10,
			filters: { codes: code },
		});
		assert.deepEqual(
			list.json.map((d) => d.id),
			[created.discounts],
		);
	});

	test('Customer: create, get, update, filter by email, duplicate and invalid email errors', async () => {
		const email = `n8n-e2e-${stamp}@example.com`;
		const create = await h.execute('sb customer create', {
			resource: 'customer',
			operation: 'create',
			email,
			additionalFields: {
				name: 'n8n e2e customer',
				locale: 'en',
				customData: '{"suite":"n8n-e2e"}',
			},
		});
		createdId(create, /^ctm_/);
		created.customers = create.json[0].id;

		const update = await h.execute('sb customer update', {
			resource: 'customer',
			operation: 'update',
			customerId: rl(created.customers),
			updateFields: { name: 'n8n e2e customer renamed' },
		});
		assert.equal(update.json[0].name, 'n8n e2e customer renamed');

		const list = await h.execute('sb customer list', {
			resource: 'customer',
			operation: 'getAll',
			limit: 10,
			filters: { email },
		});
		assert.deepEqual(
			list.json.map((c) => c.id),
			[created.customers],
		);

		const search = await h.execute('sb customer search', {
			resource: 'customer',
			operation: 'getAll',
			limit: 10,
			filters: { search: `n8n-e2e-${stamp}` },
		});
		assert.ok(search.json.some((c) => c.id === created.customers));

		const duplicate = await h.execute('sb customer duplicate', {
			resource: 'customer',
			operation: 'create',
			email,
			additionalFields: {},
		});
		console.log('    duplicate email error:', errorOf(duplicate.items[0]));
		assert.ok(duplicate.items[0].json.error, 'duplicate email is rejected');

		const invalid = await h.execute(
			'sb customer invalid',
			{ resource: 'customer', operation: 'create', email: 'not-an-email', additionalFields: {} },
			{ onError: 'stopWorkflow' },
		);
		assert.match(invalid.error.message, /Paddle rejected the value of 'Email'/);
		assert.match(invalid.error.description, /Paddle request ID: /);
	});

	test('Transaction: create, get with include, list with filters, Return All and Limit paging', async () => {
		const create = await h.execute('sb transaction create', {
			resource: 'transaction',
			operation: 'create',
			items: { item: [{ priceId: created.prices, quantity: 2 }] },
			additionalFields: {
				customerId: created.customers,
				currencyCode: 'USD',
				customData: '{"suite":"n8n-e2e"}',
			},
		});
		createdId(create, /^txn_/);
		const txn = create.json[0].id;
		assert.equal(create.json[0].customer_id, created.customers);

		const get = await h.execute('sb transaction get', {
			resource: 'transaction',
			operation: 'get',
			transactionId: rl(txn),
			simplify: false,
			getOptions: { include: ['customer', 'discount'] },
		});
		assert.equal(get.json[0].customer?.id, created.customers);

		const byCustomer = await h.execute('sb transaction list', {
			resource: 'transaction',
			operation: 'getAll',
			limit: 10,
			filters: { customerIds: created.customers },
			sort: { field: 'created_at', direction: 'DESC' },
		});
		assert.deepEqual(
			byCustomer.json.map((t) => t.id),
			[txn],
		);

		const expected = await h.paddleListAll('/transactions', 30);
		const all = await h.execute('sb transaction return all', {
			resource: 'transaction',
			operation: 'getAll',
			returnAll: true,
		});
		assert.deepEqual(all.json.map((t) => t.id).sort(), [...expected].sort());

		const limited = await h.execute('sb transaction limit 45', {
			resource: 'transaction',
			operation: 'getAll',
			limit: 45,
		});
		assert.equal(limited.json.length, Math.min(45, expected.length));
	});

	test('Subscription: list, get with include, scheduled pause and cancel (reverted), resume error', async (t) => {
		const all = await h.execute('sb subscription list', {
			resource: 'subscription',
			operation: 'getAll',
			returnAll: true,
		});
		const expected = await h.paddleListAll('/subscriptions');
		assert.deepEqual(all.json.map((s) => s.id).sort(), [...expected].sort());
		const candidate = all.json.find((s) => s.status === 'active' && s.scheduled_change === null);
		if (!candidate) {
			t.skip('no active subscription without a scheduled change in this sandbox');
			return;
		}

		const get = await h.execute('sb subscription get', {
			resource: 'subscription',
			operation: 'get',
			subscriptionId: rl(candidate.id),
			simplify: false,
			getOptions: { include: ['next_transaction'] },
		});
		assert.ok('next_transaction' in get.json[0], 'include=next_transaction is returned');

		try {
			const pause = await h.execute('sb subscription pause', {
				resource: 'subscription',
				operation: 'pause',
				subscriptionId: rl(candidate.id),
				effectiveFrom: 'next_billing_period',
				pauseOptions: {},
			});
			assert.equal(pause.json[0].scheduled_change?.action ?? errorOf(pause.items[0]), 'pause');
			await h.paddleApi('PATCH', `/subscriptions/${candidate.id}`, { scheduled_change: null });

			const cancel = await h.execute('sb subscription cancel', {
				resource: 'subscription',
				operation: 'cancel',
				subscriptionId: rl(candidate.id),
				effectiveFrom: 'next_billing_period',
			});
			assert.equal(cancel.json[0].scheduled_change?.action ?? errorOf(cancel.items[0]), 'cancel');
		} finally {
			await h.paddleApi('PATCH', `/subscriptions/${candidate.id}`, { scheduled_change: null });
		}

		const resume = await h.execute('sb subscription resume active', {
			resource: 'subscription',
			operation: 'resume',
			subscriptionId: rl(candidate.id),
			resumeWhen: 'immediately',
			resumeOptions: {},
		});
		console.log('    resume on an active subscription:', errorOf(resume.items[0]));
		assert.ok(resume.items[0].json.error, 'resuming an active subscription is an error');
	});

	test('Errors: unknown ID and wrong API key', async () => {
		const missing = await h.execute('sb 404', {
			resource: 'customer',
			operation: 'get',
			customerId: rl('ctm_01h04vsc0qhwtsbsxh3422wjs4'),
		});
		assert.match(errorOf(missing.items[0]), /Paddle couldn't find the requested record/);
		const unauthorized = await h.execute(
			'sb 401',
			{ resource: 'customer', operation: 'get', customerId: rl(created.customers) },
			{ credential: 'wrong' },
		);
		// Paddle answers an unknown key with 403, not 401, so the node blames permissions.
		console.log('    wrong key:', errorOf(unauthorized.items[0]));
		assert.match(errorOf(unauthorized.items[0]), /API key/);
	});

	test('Trigger: activation against Paddle with a non-public destination', async () => {
		const before = (await h.paddleApi('GET', '/notification-settings?per_page=200')).data.map(
			(s) => s.id,
		);
		const id = h.importTriggerWorkflow(`n8n e2e trigger ${stamp}`, {
			events: ['customer.created'],
			includeSimulations: true,
		});
		let activationError;
		await h.activate(id).catch((e) => (activationError = e));
		await new Promise((r) => setTimeout(r, 4000));
		const settings = (await h.paddleApi('GET', '/notification-settings?per_page=200')).data;
		const ours = settings.filter((s) => !before.includes(s.id));
		console.log(
			'    activation:',
			activationError ? activationError.message.slice(0, 300) : 'accepted',
			'| destinations created:',
			ours.length,
		);
		for (const s of ours) {
			assert.equal(s.description, `n8n: n8n e2e trigger ${stamp}`);
			assert.deepEqual(
				s.subscribed_events.map((e) => e.name),
				['customer.created'],
			);
			assert.equal(s.traffic_source, 'all');
		}
		await h.deactivate(id).catch(() => {});
		await new Promise((r) => setTimeout(r, 4000));
		const remaining = (await h.paddleApi('GET', '/notification-settings?per_page=200')).data.filter(
			(s) => !before.includes(s.id),
		);
		for (const s of remaining) await h.paddleApi('DELETE', `/notification-settings/${s.id}`);
		assert.equal(remaining.length, 0, 'deactivation removed the destination');
	});
});
