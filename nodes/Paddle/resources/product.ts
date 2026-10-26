import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import {
	catalogTypeOptions,
	customDataField,
	dataRootProperty,
	entityStatusOptions,
	getManyFields,
	multiQueryFilter,
	queryFilter,
	resourceLocator,
	simplifyField,
	sortField,
	TEXT_VALUE,
} from '../shared/descriptions';
import { simplifyProduct } from '../shared/simplify';

const show = { resource: ['product'] };
const showFor = (...operation: string[]) => ({ ...show, operation });

const taxCategoryOptions: INodePropertyOptions[] = [
	{ name: 'Digital Goods', value: 'digital-goods' },
	{ name: 'Ebooks', value: 'ebooks' },
	{ name: 'Implementation Services', value: 'implementation-services' },
	{ name: 'Professional Services', value: 'professional-services' },
	{ name: 'SaaS', value: 'saas' },
	{ name: 'Software Programming Services', value: 'software-programming-services' },
	{ name: 'Standard', value: 'standard' },
	{ name: 'Training Services', value: 'training-services' },
	{ name: 'Website Hosting', value: 'website-hosting' },
];

const productFields = (): INodeProperties[] => [
	customDataField(),
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		description: 'Short description for the product',
		routing: { send: { type: 'body', property: 'description' } },
	},
	{
		displayName: 'Image URL',
		name: 'imageUrl',
		type: 'string',
		default: '',
		description: 'URL of an image for the product, shown at checkout and on invoices',
		routing: { send: { type: 'body', property: 'image_url', value: TEXT_VALUE } },
	},
	{
		displayName: 'Type',
		name: 'type',
		type: 'options',
		options: catalogTypeOptions,
		default: 'standard',
		description: 'Standard products are part of your catalog and shown in the Paddle dashboard',
		routing: { send: { type: 'body', property: 'type' } },
	},
];

const includePricesOption: INodeProperties = {
	displayName: 'Include Prices',
	name: 'includePrices',
	type: 'boolean',
	default: false,
	description:
		'Whether to include the prices for each product in the response. Included prices are kept when Simplify is on.',
	routing: {
		send: { type: 'query', property: 'include', value: '={{ $value ? "prices" : undefined }}' },
	},
};

export const productDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show },
		options: [
			{
				name: 'Archive',
				value: 'archive',
				action: 'Archive a product',
				description: 'Archive a product',
				routing: {
					request: {
						method: 'PATCH',
						url: '=/products/{{$parameter.productId}}',
						body: { status: 'archived' },
					},
					output: dataRootProperty,
				},
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create a product',
				description: 'Create a product',
				routing: {
					request: { method: 'POST', url: '/products' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a product',
				description: 'Get a product by ID',
				routing: {
					request: { method: 'GET', url: '=/products/{{$parameter.productId}}' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many products',
				description: 'Get many products, optionally filtered',
				routing: {
					request: { method: 'GET', url: '/products' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a product',
				description: 'Update a product',
				routing: {
					request: { method: 'PATCH', url: '=/products/{{$parameter.productId}}' },
					output: dataRootProperty,
				},
			},
		],
		default: 'create',
	},

	resourceLocator({
		displayName: 'Product',
		name: 'productId',
		searchListMethod: 'searchProducts',
		idPrefix: 'pro',
		show: showFor('archive', 'get', 'update'),
	}),

	// Get
	simplifyField(showFor('get'), simplifyProduct),

	// Create
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: showFor('create') },
		description: 'Name of the product',
		routing: { send: { type: 'body', property: 'name' } },
	},
	{
		displayName: 'Tax Category',
		name: 'taxCategory',
		type: 'options',
		options: taxCategoryOptions,
		required: true,
		default: 'standard',
		displayOptions: { show: showFor('create') },
		description:
			'Tax category for the product. Some categories must be approved for your Paddle account first.',
		routing: { send: { type: 'body', property: 'tax_category' } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showFor('create') },
		options: productFields(),
	},

	// Update
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showFor('update') },
		options: [
			...productFields(),
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Name of the product',
				routing: { send: { type: 'body', property: 'name', value: TEXT_VALUE } },
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: entityStatusOptions,
				default: 'active',
				description: 'Whether the product is active or archived',
				routing: { send: { type: 'body', property: 'status' } },
			},
			{
				displayName: 'Tax Category',
				name: 'taxCategory',
				type: 'options',
				options: taxCategoryOptions,
				default: 'standard',
				description: 'Tax category for the product',
				routing: { send: { type: 'body', property: 'tax_category' } },
			},
		],
	},

	// Get
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showFor('get') },
		options: [includePricesOption],
	},

	// Get Many
	...getManyFields(showFor('getAll'), 200),
	simplifyField(showFor('getAll'), simplifyProduct),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showFor('getAll') },
		options: [
			queryFilter(
				'IDs',
				'ids',
				'id',
				'Return only these product IDs (comma-separated)',
				'e.g. pro_01gsz4t5hdjse780zja8vvr7jg',
			),
			includePricesOption,
			multiQueryFilter('Status', 'status', 'status', entityStatusOptions),
			multiQueryFilter('Tax Category', 'taxCategory', 'tax_category', taxCategoryOptions),
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				options: catalogTypeOptions,
				default: 'standard',
				description: 'Return only products of this type',
				routing: { send: { type: 'query', property: 'type' } },
			},
		],
	},
	sortField(showFor('getAll'), [
		{ name: 'Created At', value: 'created_at' },
		{ name: 'Description', value: 'description' },
		{ name: 'Image URL', value: 'image_url' },
		{ name: 'Name', value: 'name' },
		{ name: 'Status', value: 'status' },
		{ name: 'Tax Category', value: 'tax_category' },
		{ name: 'Updated At', value: 'updated_at' },
	]),
];
