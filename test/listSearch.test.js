const { test } = require('node:test');
const assert = require('node:assert');
const search = require('../dist/nodes/Paddle/listSearch');

const node = { name: 'Paddle Billing', type: 'paddle', typeVersion: 1, parameters: {} };

function fakeContext(data, hasMore = false, statusCode = 200) {
	const calls = [];
	return {
		calls,
		getNode: () => node,
		async getCredentials() {
			return { environment: 'sandbox' };
		},
		helpers: {
			async httpRequestWithAuthentication(_name, options) {
				calls.push(options);
				if (statusCode >= 400) {
					return {
						statusCode,
						body: { error: { code: 'forbidden', detail: 'Not permitted' } },
					};
				}
				return { statusCode, body: { data, meta: { pagination: { has_more: hasMore } } } };
			},
		},
	};
}

test('customers: sends the search param and labels name, email and ID', async () => {
	const ctx = fakeContext([
		{ id: 'ctm_1', name: 'Ada', email: 'ada@example.com' },
		{ id: 'ctm_2', name: null, email: 'bob@example.com' },
	]);
	const result = await search.searchCustomers.call(ctx, 'ada');
	assert.strictEqual(ctx.calls[0].qs.search, 'ada');
	assert.strictEqual(ctx.calls[0].qs.per_page, 200);
	assert.strictEqual(ctx.calls[0].url, 'https://sandbox-api.paddle.com/customers');
	assert.deepStrictEqual(result.results, [
		{ name: 'Ada <ada@example.com> (ctm_1)', value: 'ctm_1' },
		{ name: 'bob@example.com (ctm_2)', value: 'ctm_2' },
	]);
	assert.strictEqual(result.paginationToken, undefined);
});

test('products: filters client-side by label or ID without sending a search param', async () => {
	const ctx = fakeContext([
		{ id: 'pro_abc', name: 'Pro Plan' },
		{ id: 'pro_def', name: 'Starter' },
		{ id: 'pro_ghi', name: 'Team' },
	]);
	const result = await search.searchProducts.call(ctx, 'PRO');
	assert.strictEqual(ctx.calls[0].qs.search, undefined);
	assert.deepStrictEqual(
		result.results.map((r) => r.value),
		['pro_abc', 'pro_def', 'pro_ghi'],
	);

	const ctx2 = fakeContext([
		{ id: 'pro_abc', name: 'Pro Plan' },
		{ id: 'pro_def', name: 'Starter' },
	]);
	const starter = await search.searchProducts.call(ctx2, 'start');
	assert.deepStrictEqual(starter.results, [{ name: 'Starter (pro_def)', value: 'pro_def' }]);
});

test('pagination token is the last ID only when Paddle has more', async () => {
	const more = await search.searchProducts.call(
		fakeContext(
			[
				{ id: 'pro_1', name: 'A' },
				{ id: 'pro_2', name: 'B' },
			],
			true,
		),
	);
	assert.strictEqual(more.paginationToken, 'pro_2');

	const done = await search.searchProducts.call(
		fakeContext(
			[
				{ id: 'pro_1', name: 'A' },
				{ id: 'pro_2', name: 'B' },
			],
			false,
		),
	);
	assert.strictEqual(done.paginationToken, undefined);

	const empty = await search.searchProducts.call(fakeContext([], true));
	assert.strictEqual(empty.paginationToken, undefined);
});

test('sends `after` when continuing from a pagination token', async () => {
	const ctx = fakeContext([]);
	await search.searchProducts.call(ctx, undefined, 'pro_2');
	assert.strictEqual(ctx.calls[0].qs.after, 'pro_2');
});

test('transactions: 30 per page, labelled with status', async () => {
	const ctx = fakeContext([{ id: 'txn_1', status: 'completed' }]);
	const result = await search.searchTransactions.call(ctx);
	assert.strictEqual(ctx.calls[0].qs.per_page, 30);
	assert.deepStrictEqual(result.results, [{ name: 'txn_1 (completed)', value: 'txn_1' }]);
});

test('subscriptions: labelled with status', async () => {
	const result = await search.searchSubscriptions.call(
		fakeContext([{ id: 'sub_1', status: 'active' }]),
	);
	assert.deepStrictEqual(result.results, [{ name: 'sub_1 (active)', value: 'sub_1' }]);
});

test('prices: falls back from name to description', async () => {
	const result = await search.searchPrices.call(
		fakeContext([
			{ id: 'pri_1', name: 'Monthly', description: 'internal' },
			{ id: 'pri_2', name: null, description: 'Yearly internal' },
		]),
	);
	assert.deepStrictEqual(
		result.results.map((r) => r.name),
		['Monthly (pri_1)', 'Yearly internal (pri_2)'],
	);
});

test('discounts: label includes the code when there is one', async () => {
	const result = await search.searchDiscounts.call(
		fakeContext([
			{ id: 'dsc_1', code: 'SAVE10', description: 'Ten off' },
			{ id: 'dsc_2', code: null, description: 'Partner' },
		]),
	);
	assert.deepStrictEqual(
		result.results.map((r) => r.name),
		['SAVE10: Ten off (dsc_1)', 'Partner (dsc_2)'],
	);
});

test('a Paddle error becomes a NodeApiError with the permission message', async () => {
	await assert.rejects(search.searchCustomers.call(fakeContext([], false, 403)), (error) => {
		assert.strictEqual(error.constructor.name, 'NodeApiError');
		assert.strictEqual(error.message, "The API key doesn't have permission for this action");
		return true;
	});
});
