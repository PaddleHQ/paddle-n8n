const { test } = require('node:test');
const assert = require('node:assert');
const { TEXT_VALUE } = require('../dist/nodes/Paddle/shared/descriptions');
const { discountDescription } = require('../dist/nodes/Paddle/resources/discount');
const { priceDescription } = require('../dist/nodes/Paddle/resources/price');
const { PADDLE_EVENTS } = require('../dist/nodes/PaddleTrigger/events');

const evaluate = (value, $value) => new Function('$value', `return ${value.slice(4, -3)}`)($value);

test('blank optional text is left out instead of sending ""', () => {
	assert.strictEqual(evaluate(TEXT_VALUE, ''), undefined);
	assert.strictEqual(evaluate(TEXT_VALUE, '   '), undefined);
	assert.strictEqual(evaluate(TEXT_VALUE, 'SUMMER'), 'SUMMER');
});

test('price update leaves out a unit price with a blank amount', () => {
	const updateFields = priceDescription.find((p) => p.name === 'updateFields');
	const unitPrice = updateFields.options.find((o) => o.name === 'unitPrice');
	const value = unitPrice.routing.send.value;
	assert.strictEqual(evaluate(value, {}), undefined);
	assert.strictEqual(evaluate(value, { price: { amount: '', currency_code: 'USD' } }), undefined);
	assert.deepStrictEqual(evaluate(value, { price: { amount: '1000', currency_code: 'USD' } }), {
		amount: '1000',
		currency_code: 'USD',
	});
});

test('discount create requires a currency only for flat discounts', () => {
	const currency = discountDescription.find((p) => p.name === 'currencyCode');
	assert.strictEqual(currency.required, true);
	assert.deepStrictEqual(currency.displayOptions.show.type, ['flat', 'flat_per_seat']);
	const additional = discountDescription.find((p) => p.name === 'additionalFields');
	assert.ok(!additional.options.some((o) => o.name === 'currencyCode'));
});

test('trigger events are unique and correctly worded', () => {
	const values = PADDLE_EVENTS.map((e) => e.value);
	assert.strictEqual(new Set(values).size, values.length);
	for (const event of ['meter.created', 'meter.updated', 'usage_balance.depleted']) {
		assert.ok(values.includes(event), event);
	}
	for (const { description } of PADDLE_EVENTS) {
		assert.doesNotMatch(description, /\ban [bcdfghjklmnpqrstvwxyz]/i, description);
	}
});
