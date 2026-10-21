const { test } = require('node:test');
const assert = require('node:assert');
const { customDataField } = require('../dist/nodes/Paddle/shared/descriptions');

const node = { name: 'Paddle Billing', type: 'paddle', typeVersion: 1, parameters: {} };
const [preSend] = customDataField().routing.send.preSend;

const context = (value, operation = 'create') => ({
	getNode: () => node,
	getItemIndex: () => 3,
	getNodeParameter: (name, fallback) => {
		if (name === 'operation') return operation;
		const collection = operation === 'update' ? 'updateFields' : 'additionalFields';
		return name === `${collection}.customData` ? value : fallback;
	},
});

test('sends parsed JSON as custom_data', async () => {
	const options = await preSend.call(context('{"plan":"pro"}'), { body: { email: 'a@b.c' } });
	assert.deepStrictEqual(options.body, { email: 'a@b.c', custom_data: { plan: 'pro' } });
});

test('reads Update Fields for the update operation', async () => {
	const options = await preSend.call(context('{"tier":"a"}', 'update'), {});
	assert.deepStrictEqual(options.body, { custom_data: { tier: 'a' } });
});

test('passes an object from an expression through', async () => {
	const options = await preSend.call(context({ plan: 'pro' }), {});
	assert.deepStrictEqual(options.body, { custom_data: { plan: 'pro' } });
});

test('rejects malformed JSON with an error naming the parameter', async () => {
	await assert.rejects(preSend.call(context('{not json'), {}), (error) => {
		assert.strictEqual(error.message, "'Custom Data' isn't valid JSON [item 3]");
		assert.match(error.description, /for example \{"plan": "pro"\}/);
		return true;
	});
});

test('rejects values that are not an object', async () => {
	for (const value of ['[1,2]', 'null', '"text"', '42']) {
		await assert.rejects(preSend.call(context(value), {}), /'Custom Data' must be a JSON object/);
	}
});
