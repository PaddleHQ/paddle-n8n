const { test } = require('node:test');
const assert = require('node:assert');
const simplify = require('../dist/nodes/Paddle/shared/simplify');
const { sortField } = require('../dist/nodes/Paddle/shared/descriptions');

test('every simplified record has at most 10 fields', () => {
	for (const fn of Object.values(simplify)) {
		assert.ok(Object.keys(fn({})).length <= 10, fn.name);
	}
});

test('keeps included prices on a simplified product', () => {
	const prices = [{ id: 'pri_1' }];
	assert.deepStrictEqual(simplify.simplifyProduct({ id: 'pro_1', prices }).prices, prices);
	assert.ok(!('prices' in simplify.simplifyProduct({ id: 'pro_1' })));
});

test('flattens nested subscription fields', () => {
	const result = simplify.simplifySubscription({
		id: 'sub_1',
		status: 'active',
		billing_cycle: { interval: 'month', frequency: 1 },
		scheduled_change: { action: 'cancel', effective_at: '2026-01-01T00:00:00Z' },
		items: [{ price: { id: 'pri_1' } }, { price: { id: 'pri_2' } }],
	});
	assert.strictEqual(result.billing_interval, 'month');
	assert.strictEqual(result.scheduled_change, 'cancel');
	assert.deepStrictEqual(result.price_ids, ['pri_1', 'pri_2']);
});

test('flattens price and transaction amounts', () => {
	const price = simplify.simplifyPrice({ unit_price: { amount: '1000', currency_code: 'USD' } });
	assert.strictEqual(price.amount, '1000');
	assert.strictEqual(price.currency_code, 'USD');
	assert.strictEqual(price.billing_interval, null);

	const transaction = simplify.simplifyTransaction({
		details: { totals: { grand_total: '1200' } },
	});
	assert.strictEqual(transaction.total, '1200');
});

test('sort sends order_by and lists ID with the given fields', () => {
	const sort = sortField({ resource: ['product'] }, [{ name: 'Name', value: 'name' }]);
	const [direction, field] = sort.options;
	assert.strictEqual(direction.routing.send.property, 'order_by');
	assert.deepStrictEqual(
		field.options.map((o) => o.value),
		['id', 'name'],
	);
	assert.strictEqual(sortField({ resource: ['customer'] }).options.length, 1);
});
