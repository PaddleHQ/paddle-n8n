const { test } = require('node:test');
const assert = require('node:assert');
const {
	CSV_QUERY_VALUE,
	DATE_TIME_VALUE,
	LIST_VALUE,
	multiQueryFilter,
	queryFilter,
} = require('../dist/nodes/Paddle/shared/descriptions');
const { customerDescription } = require('../dist/nodes/Paddle/resources/customer');
const { subscriptionDescription } = require('../dist/nodes/Paddle/resources/subscription');
const { transactionDescription } = require('../dist/nodes/Paddle/resources/transaction');

// Runs the JavaScript inside an n8n `={{ ... }}` expression; only the plain-JS logic is checked.
const evaluate = (expression, $value) => {
	assert.match(expression, /^=\{\{[\s\S]*\}\}$/, expression);
	return new Function('$value', `return (${expression.slice(3, -2)});`)($value);
};

test('empty, null and undefined filters are left out of the request', () => {
	for (const value of ['', ' , ', [], null, undefined]) {
		assert.strictEqual(evaluate(CSV_QUERY_VALUE, value), undefined, JSON.stringify(value));
	}
	assert.deepStrictEqual(evaluate(LIST_VALUE, null), []);
	assert.deepStrictEqual(evaluate(LIST_VALUE, 'a, b'), ['a', 'b']);
	assert.strictEqual(queryFilter('IDs', 'ids', 'id', 'd').routing.send.value, CSV_QUERY_VALUE);
	assert.strictEqual(multiQueryFilter('S', 's', 's', []).routing.send.value, CSV_QUERY_VALUE);
});

test('filled filters are sent as trimmed comma-separated lists', () => {
	assert.strictEqual(evaluate(CSV_QUERY_VALUE, ' ctm_1 , ctm_2,, '), 'ctm_1,ctm_2');
	assert.strictEqual(evaluate(CSV_QUERY_VALUE, ['active', 'past_due']), 'active,past_due');
});

test('every list-valued query parameter uses the same expression', () => {
	const option = (description, collection, name) =>
		description.find((p) => p.name === collection).options.find((o) => o.name === name);
	assert.strictEqual(
		option(customerDescription, 'filters', 'email').routing.send.value,
		CSV_QUERY_VALUE,
	);
	assert.strictEqual(
		option(subscriptionDescription, 'getOptions', 'include').routing.send.value,
		CSV_QUERY_VALUE,
	);
	assert.strictEqual(
		option(transactionDescription, 'getOptions', 'include').routing.send.value,
		CSV_QUERY_VALUE,
	);
});

test('empty and null dates are left out of the request', () => {
	for (const value of ['', null, undefined]) {
		assert.strictEqual(evaluate(DATE_TIME_VALUE, value), undefined, JSON.stringify(value));
	}
});

test('non-ISO date strings are parsed as before', () => {
	assert.strictEqual(
		evaluate(DATE_TIME_VALUE, 'Thu, 01 Jan 2026 10:00:00 GMT'),
		'2026-01-01T10:00:00.000Z',
	);
	assert.strictEqual(
		evaluate(DATE_TIME_VALUE, 'Thu Jan 01 2026 10:00:00 GMT+0100 (CET)'),
		'2026-01-01T09:00:00.000Z',
	);
});

test('dates without an offset are treated as UTC', () => {
	assert.strictEqual(evaluate(DATE_TIME_VALUE, '2026-01-01T10:00:00'), '2026-01-01T10:00:00.000Z');
	assert.strictEqual(
		evaluate(DATE_TIME_VALUE, '2026-01-01T10:00:00.250'),
		'2026-01-01T10:00:00.250Z',
	);
	assert.strictEqual(evaluate(DATE_TIME_VALUE, '2026-01-01 10:00'), '2026-01-01T10:00:00.000Z');
	assert.strictEqual(evaluate(DATE_TIME_VALUE, '2026-01-01'), '2026-01-01T00:00:00.000Z');
});

test('dates with an offset keep their instant', () => {
	assert.strictEqual(evaluate(DATE_TIME_VALUE, '2026-01-01T10:00:00Z'), '2026-01-01T10:00:00.000Z');
	assert.strictEqual(
		evaluate(DATE_TIME_VALUE, '2026-01-01T10:00:00+02:00'),
		'2026-01-01T08:00:00.000Z',
	);
	assert.strictEqual(
		evaluate(DATE_TIME_VALUE, '2026-01-01T10:00:00-0500'),
		'2026-01-01T15:00:00.000Z',
	);
	const date = new Date('2026-06-01T12:00:00Z');
	assert.strictEqual(evaluate(DATE_TIME_VALUE, date), '2026-06-01T12:00:00.000Z');
	assert.strictEqual(evaluate(DATE_TIME_VALUE, date.getTime()), '2026-06-01T12:00:00.000Z');
});
