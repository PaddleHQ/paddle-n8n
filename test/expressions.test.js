const { test } = require('node:test');
const assert = require('node:assert');
const {
	DATE_TIME_VALUE,
	LIST_VALUE,
	sortField,
	getManyFields,
} = require('../dist/nodes/Paddle/shared/descriptions');
const { transactionDescription } = require('../dist/nodes/Paddle/resources/transaction');
const { priceDescription } = require('../dist/nodes/Paddle/resources/price');
const { productDescription } = require('../dist/nodes/Paddle/resources/product');
const { subscriptionDescription } = require('../dist/nodes/Paddle/resources/subscription');

// Runs the JavaScript inside an n8n `={{ ... }}` routing expression. n8n's expression
// sandbox is not available here, so only the plain-JS logic is checked.
function evaluate(expression, { $value, $parameter } = {}) {
	assert.match(expression, /^=\{\{[\s\S]*\}\}$/, expression);
	const inner = expression.slice(3, -2);
	return new Function('$value', '$parameter', `return (${inner});`)($value, $parameter);
}

const findProperty = (properties, name) => properties.find((p) => p.name === name);
const findOption = (properties, collection, name) =>
	findProperty(properties, collection).options.find((o) => o.name === name);

test('DATE_TIME_VALUE normalises to an RFC 3339 timestamp', () => {
	assert.strictEqual(
		evaluate(DATE_TIME_VALUE, { $value: '2026-01-01T00:00:00Z' }),
		'2026-01-01T00:00:00.000Z',
	);
	assert.strictEqual(
		evaluate(DATE_TIME_VALUE, { $value: '2026-01-01T10:00:00+02:00' }),
		'2026-01-01T08:00:00.000Z',
	);
});

test('LIST_VALUE splits comma lists and accepts arrays', () => {
	assert.deepStrictEqual(evaluate(LIST_VALUE, { $value: 'a, b,,c ' }), ['a', 'b', 'c']);
	assert.deepStrictEqual(evaluate(LIST_VALUE, { $value: ['x', ' y '] }), ['x', 'y']);
	assert.deepStrictEqual(evaluate(LIST_VALUE, { $value: '' }), []);
});

test('transaction items map to Paddle price_id and quantity', () => {
	const items = findProperty(transactionDescription, 'items');
	const value = {
		item: [
			{ priceId: 'pri_1', quantity: 2 },
			{ priceId: 'pri_2', quantity: 1 },
		],
	};
	assert.deepStrictEqual(evaluate(items.routing.send.value, { $value: value }), [
		{ price_id: 'pri_1', quantity: 2 },
		{ price_id: 'pri_2', quantity: 1 },
	]);
	assert.deepStrictEqual(evaluate(items.routing.send.value, { $value: {} }), []);
});

test('sort expression defaults to id ascending', () => {
	const sort = sortField({ resource: ['product'] }, [{ name: 'Name', value: 'name' }]);
	const expression = sort.options[0].routing.send.value;
	assert.strictEqual(evaluate(expression, { $parameter: { sort: {} } }), 'id[ASC]');
	assert.strictEqual(
		evaluate(expression, { $parameter: { sort: { direction: 'DESC' } } }),
		'id[DESC]',
	);
	assert.strictEqual(
		evaluate(expression, { $parameter: { sort: { field: 'name', direction: 'DESC' } } }),
		'name[DESC]',
	);
});

test('Limit caps per_page at the endpoint maximum', () => {
	const [, limit] = getManyFields({ resource: ['transaction'] }, 30);
	assert.strictEqual(evaluate(limit.routing.send.value, { $value: 10 }), 10);
	assert.strictEqual(evaluate(limit.routing.send.value, { $value: 500 }), 30);
});

test('multi-option query filters join values with commas', () => {
	const status = findOption(transactionDescription, 'filters', 'status');
	assert.strictEqual(
		evaluate(status.routing.send.value, { $value: ['paid', 'billed'] }),
		'paid,billed',
	);
	const include = findOption(subscriptionDescription, 'getOptions', 'include');
	assert.strictEqual(
		evaluate(include.routing.send.value, { $value: ['next_transaction'] }),
		'next_transaction',
	);
});

test('comma-separated ID filters are trimmed', () => {
	const ids = findOption(transactionDescription, 'filters', 'ids');
	assert.strictEqual(
		evaluate(ids.routing.send.value, { $value: ' txn_1 , txn_2,, ' }),
		'txn_1,txn_2',
	);
});

test('fixed collections unwrap to the Paddle object, and Include Prices is omitted when off', () => {
	const cycle = findOption(priceDescription, 'additionalFields', 'billingCycle');
	assert.deepStrictEqual(
		evaluate(cycle.routing.send.value, { $value: { cycle: { interval: 'month', frequency: 1 } } }),
		{
			interval: 'month',
			frequency: 1,
		},
	);
	assert.strictEqual(evaluate(cycle.routing.send.value, { $value: {} }), undefined);

	const includePrices = findOption(productDescription, 'options', 'includePrices');
	assert.strictEqual(evaluate(includePrices.routing.send.value, { $value: true }), 'prices');
	assert.strictEqual(evaluate(includePrices.routing.send.value, { $value: false }), undefined);
});

test('subscription resume sends effective_from only for an immediate resume', () => {
	const resumeWhen = findProperty(subscriptionDescription, 'resumeWhen');
	assert.strictEqual(
		evaluate(resumeWhen.routing.send.value, { $value: 'immediately' }),
		'immediately',
	);
	assert.strictEqual(evaluate(resumeWhen.routing.send.value, { $value: 'onDate' }), undefined);
});
