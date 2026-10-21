const { test } = require('node:test');
const assert = require('node:assert');
const { customDataField } = require('../dist/nodes/Paddle/shared/descriptions');

const node = { name: 'Paddle Billing', type: 'paddle', typeVersion: 1, parameters: {} };
const field = customDataField();
const [preSend] = field.routing.send.preSend;
const context = { getNode: () => node, getItemIndex: () => 3 };
const send = (custom_data, rest = {}) => preSend.call(context, { body: { ...rest, custom_data } });

test('is placed in the body before parsing', () => {
	assert.strictEqual(field.routing.send.type, 'body');
	assert.strictEqual(field.routing.send.property, 'custom_data');
});

test('sends parsed JSON as custom_data alongside the other fields', async () => {
	const options = await send('{"plan":"pro"}', { email: 'a@b.c' });
	assert.deepStrictEqual(options.body, { email: 'a@b.c', custom_data: { plan: 'pro' } });
});

test('passes objects and null from expressions through', async () => {
	assert.deepStrictEqual((await send({ plan: 'pro' })).body, { custom_data: { plan: 'pro' } });
	assert.deepStrictEqual((await send(null)).body, { custom_data: null });
});

test('accepts null typed in the editor, which clears the custom data', async () => {
	assert.deepStrictEqual((await send('null')).body, { custom_data: null });
});

test('leaves custom_data out when the field is empty', async () => {
	assert.deepStrictEqual((await send('', { name: 'n' })).body, { name: 'n' });
	assert.deepStrictEqual((await send('  \n')).body, {});
});

test('rejects malformed JSON with an error naming the parameter and sends nothing', async () => {
	await assert.rejects(send('{not json'), (error) => {
		assert.strictEqual(error.message, "'Custom Data' isn't valid JSON [item 3]");
		assert.match(error.description, /for example \{"plan": "pro"\}/);
		return true;
	});
});

test('rejects values that are not an object, typed or from an expression', async () => {
	for (const value of ['[1,2]', '"text"', '42', [1, 2], 42, true]) {
		await assert.rejects(
			send(value),
			/'Custom Data' must be a JSON object or null/,
			JSON.stringify(value),
		);
	}
});
