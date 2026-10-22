const { test } = require('node:test');
const assert = require('node:assert');
const {
	resourceLocator,
	getManyFields,
	queryFilter,
	multiQueryFilter,
	simplifyField,
	currencyOptions,
} = require('../dist/nodes/Paddle/shared/descriptions');
const { paddlePagination } = require('../dist/nodes/Paddle/shared/pagination');
const { Paddle } = require('../dist/nodes/Paddle/Paddle.node');

test('resourceLocator validates IDs against the resource prefix', () => {
	const locator = resourceLocator({
		displayName: 'Customer',
		name: 'customerId',
		searchListMethod: 'searchCustomers',
		idPrefix: 'ctm',
		show: { resource: ['customer'], operation: ['get'] },
	});
	assert.strictEqual(locator.type, 'resourceLocator');
	assert.strictEqual(locator.required, true);
	assert.deepStrictEqual(locator.default, { mode: 'list', value: '' });
	assert.strictEqual(locator.modes[0].typeOptions.searchListMethod, 'searchCustomers');

	const regex = new RegExp(locator.modes[1].validation[0].properties.regex);
	assert.ok(regex.test('ctm_01h04vsc0qhwtsbsxh3422wjs4'));
	assert.ok(!regex.test('pri_01h04vsc0qhwtsbsxh3422wjs4'));
	assert.ok(!regex.test('ctm_01H04VSC0QHWTSBSXH3422WJS4'));
	assert.ok(!regex.test('ctm_'));
	assert.ok(!regex.test(' ctm_01h04vsc0qhwtsbsxh3422wjs4'));
});

test('getManyFields wires Return All and Limit to Paddle paging', () => {
	const show = { resource: ['customer'], operation: ['getAll'] };
	const [returnAll, limit] = getManyFields(show, 200);

	assert.strictEqual(returnAll.name, 'returnAll');
	assert.deepStrictEqual(returnAll.displayOptions, { show });
	assert.strictEqual(returnAll.routing.send.paginate, true);
	assert.strictEqual(returnAll.routing.send.property, 'per_page');
	assert.strictEqual(returnAll.routing.send.value, '200');
	assert.strictEqual(returnAll.routing.operations.pagination, paddlePagination);

	assert.strictEqual(limit.name, 'limit');
	assert.deepStrictEqual(limit.displayOptions, { show: { ...show, returnAll: [false] } });
	assert.strictEqual(limit.typeOptions.minValue, 1);
	assert.strictEqual(limit.routing.send.property, 'per_page');
	assert.strictEqual(limit.routing.send.value, '={{ Math.min($value, 200) }}');
	assert.strictEqual(limit.routing.output.maxResults, '={{ $value }}');
});

test('query filters send to the given query-string key', () => {
	const single = queryFilter('IDs', 'ids', 'id', 'desc', 'e.g. x');
	assert.strictEqual(single.type, 'string');
	assert.strictEqual(single.routing.send.type, 'query');
	assert.strictEqual(single.routing.send.property, 'id');

	const multi = multiQueryFilter('Status', 'status', 'status', [{ name: 'A', value: 'a' }]);
	assert.strictEqual(multi.type, 'multiOptions');
	assert.strictEqual(multi.routing.send.type, 'query');
	assert.strictEqual(multi.routing.send.property, 'status');
	assert.deepStrictEqual(multi.default, []);
});

test('simplifyField only maps items when Simplify is on', async () => {
	const field = simplifyField({ resource: ['product'] }, (record) => ({ id: record.id }));
	assert.strictEqual(field.default, true);
	const [postReceive] = field.routing.output.postReceive;
	const items = [{ json: { id: 'pro_1', name: 'x' }, pairedItem: { item: 0 } }];

	const off = await postReceive.call({ getNodeParameter: () => false }, items);
	assert.strictEqual(off, items);

	const on = await postReceive.call({ getNodeParameter: () => true }, items);
	assert.deepStrictEqual(on, [{ json: { id: 'pro_1' }, pairedItem: { item: 0 } }]);
});

test('currency options are unique ISO codes', () => {
	const values = currencyOptions.map((o) => o.value);
	assert.strictEqual(new Set(values).size, values.length);
	for (const value of values) assert.match(value, /^[A-Z]{3}$/);
	assert.ok(values.includes('USD') && values.includes('EUR') && values.includes('GBP'));
});

// --- Paddle node description consistency ---

const { description } = new Paddle();
const resources = description.properties[0].options.map((o) => o.value);
const operationsFor = (resource) =>
	description.properties.find(
		(p) => p.name === 'operation' && p.displayOptions.show.resource.includes(resource),
	);

test('Paddle node description has the expected identity', () => {
	assert.strictEqual(description.name, 'paddle');
	assert.strictEqual(description.usableAsTool, true);
	assert.strictEqual(description.properties[0].name, 'resource');
	assert.strictEqual(description.requestDefaults.ignoreHttpStatusErrors, true);
	assert.deepStrictEqual(description.credentials, [{ name: 'paddleBillingApi', required: true }]);
});

test('every property is scoped to a known resource and operation', () => {
	for (const property of description.properties.slice(1)) {
		const show = property.displayOptions?.show;
		assert.ok(show?.resource, `${property.name} has no resource scope`);
		for (const resource of show.resource) {
			assert.ok(resources.includes(resource), `${property.name}: unknown resource ${resource}`);
			if (property.name === 'operation') continue;
			const known = operationsFor(resource).options.map((o) => o.value);
			for (const op of show.operation ?? []) {
				assert.ok(known.includes(op), `${property.name}: unknown operation ${op} for ${resource}`);
			}
		}
	}
});

test('each resource has one operation property with unique, routed operations', () => {
	for (const resource of resources) {
		const operations = description.properties.filter(
			(p) => p.name === 'operation' && p.displayOptions.show.resource.includes(resource),
		);
		assert.strictEqual(operations.length, 1, resource);
		const values = operations[0].options.map((o) => o.value);
		assert.strictEqual(new Set(values).size, values.length, resource);
		for (const option of operations[0].options) {
			assert.ok(option.routing?.request?.method, `${resource}.${option.value} has no request`);
			assert.ok(option.action, `${resource}.${option.value} has no action`);
		}
	}
});

test('parameter names never collide among properties visible at the same time', () => {
	for (const resource of resources) {
		for (const operation of operationsFor(resource).options.map((o) => o.value)) {
			const visible = description.properties.filter((p) => {
				const show = p.displayOptions?.show ?? {};
				const resourceOk = !show.resource || show.resource.includes(resource);
				const operationOk = !show.operation || show.operation.includes(operation);
				return resourceOk && operationOk;
			});
			const names = visible.map((p) => p.name);
			const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
			assert.deepStrictEqual(duplicates, [], `${resource}.${operation}: duplicate ${duplicates}`);
		}
	}
});

test('collections never contain two options with the same name', () => {
	for (const property of description.properties) {
		if (property.type !== 'collection') continue;
		const names = property.options.map((o) => o.name);
		assert.strictEqual(new Set(names).size, names.length, `${property.name}: ${names}`);
	}
});
