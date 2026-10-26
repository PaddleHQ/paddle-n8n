const { test } = require('node:test');
const assert = require('node:assert');
const simplify = require('../dist/nodes/Paddle/shared/simplify');
const { sortField } = require('../dist/nodes/Paddle/shared/descriptions');
const { subscriptionDescription } = require('../dist/nodes/Paddle/resources/subscription');
const { transactionDescription } = require('../dist/nodes/Paddle/resources/transaction');

const simplifiers = Object.values(simplify).filter((v) => typeof v === 'function');

test('every simplified record has at most 10 fields when nothing was included', () => {
	for (const fn of simplifiers) {
		assert.ok(Object.keys(fn({})).length <= 10, fn.name);
	}
});

test('keeps included prices on a simplified product, simplified like a price', () => {
	const prices = [{ id: 'pri_1', unit_price: { amount: '100', currency_code: 'USD' } }];
	const product = simplify.simplifyProduct({ id: 'pro_1', prices });
	assert.deepStrictEqual(
		product.prices.map((p) => [p.id, p.amount]),
		[['pri_1', '100']],
	);
	assert.ok(!('prices' in simplify.simplifyProduct({ id: 'pro_1' })));
});

test('keeps every includable relation on subscriptions and transactions', () => {
	const includeValues = (description) =>
		description
			.find((p) => p.name === 'getOptions')
			.options.find((o) => o.name === 'include')
			.options.map((o) => o.value);

	for (const [description, fn, known] of [
		[subscriptionDescription, simplify.simplifySubscription, simplify.SUBSCRIPTION_INCLUDES],
		[transactionDescription, simplify.simplifyTransaction, simplify.TRANSACTION_INCLUDES],
	]) {
		const keys = includeValues(description);
		assert.deepStrictEqual([...keys].sort(), [...known].sort());
		const record = Object.fromEntries(keys.map((key) => [key, { via: key }]));
		const simplified = fn({ id: 'x', ...record });
		for (const key of keys) assert.deepStrictEqual(simplified[key], { via: key });
		assert.ok(keys.every((key) => !(key in fn({ id: 'x' }))));
	}
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

test('blank optional dates are left out instead of failing', () => {
	const { DATE_TIME_VALUE } = require('../dist/nodes/Paddle/shared/descriptions');
	const expression = DATE_TIME_VALUE.slice(4, -3);
	const evaluate = new Function('$value', `return ${expression}`);
	assert.strictEqual(evaluate(''), undefined);
	assert.strictEqual(evaluate('2026-01-02T03:04:05Z'), '2026-01-02T03:04:05.000Z');
});
