import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import {
	catalogTypeOptions,
	currencyOptions,
	customDataField,
	dataRootProperty,
	entityStatusOptions,
	getManyFields,
	intervalOptions,
	multiQueryFilter,
	queryFilter,
	resourceLocator,
	simplifyField,
	sortField,
	TEXT_VALUE,
} from '../shared/descriptions';
import { simplifyPrice } from '../shared/simplify';

const show = { resource: ['price'] };
const showFor = (...operation: string[]) => ({ ...show, operation });

const taxModeOptions: INodePropertyOptions[] = [
	{ name: 'Account Setting', value: 'account_setting', description: 'Use your account default' },
	{ name: 'External', value: 'external', description: 'Prices exclude tax' },
	{ name: 'Internal', value: 'internal', description: 'Prices include tax' },
	{
		name: 'Location',
		value: 'location',
		description: "Paddle decides based on the customer's location",
	},
];

// Optional price fields shared by Create and Update
const priceFields = (): INodeProperties[] => [
	{
		displayName: 'Billing Cycle',
		name: 'billingCycle',
		type: 'fixedCollection',
		default: {},
		placeholder: 'Add Billing Cycle',
		description: 'How often this price charges. Leave empty for a one-time price.',
		options: [
			{
				displayName: 'Billing Cycle',
				name: 'cycle',
				values: [
					{
						displayName: 'Frequency',
						name: 'frequency',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1,
						description: 'Number of intervals between charges',
					},
					{
						displayName: 'Interval',
						name: 'interval',
						type: 'options',
						options: intervalOptions,
						default: 'month',
					},
				],
			},
		],
		routing: { send: { type: 'body', property: 'billing_cycle', value: '={{ $value.cycle }}' } },
	},
	customDataField(),
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		description:
			'Name of the price, shown to customers at checkout and on invoices (e.g. "Monthly")',
		routing: { send: { type: 'body', property: 'name', value: TEXT_VALUE } },
	},
	{
		displayName: 'Quantity',
		name: 'quantity',
		type: 'fixedCollection',
		default: {},
		placeholder: 'Add Quantity Limits',
		description: 'Limits on how many of this price a customer can buy in one transaction',
		options: [
			{
				displayName: 'Quantity',
				name: 'limits',
				values: [
					{
						displayName: 'Maximum',
						name: 'maximum',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 100,
					},
					{
						displayName: 'Minimum',
						name: 'minimum',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1,
					},
				],
			},
		],
		routing: { send: { type: 'body', property: 'quantity', value: '={{ $value.limits }}' } },
	},
	{
		displayName: 'Tax Mode',
		name: 'taxMode',
		type: 'options',
		options: taxModeOptions,
		default: 'account_setting',
		description: 'How tax is calculated for this price',
		routing: { send: { type: 'body', property: 'tax_mode' } },
	},
	{
		displayName: 'Trial Period',
		name: 'trialPeriod',
		type: 'fixedCollection',
		default: {},
		placeholder: 'Add Trial Period',
		description: 'Trial period for the product related to this price',
		options: [
			{
				displayName: 'Trial Period',
				name: 'trial',
				values: [
					{
						displayName: 'Frequency',
						name: 'frequency',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 14,
						description: 'Number of intervals the trial lasts',
					},
					{
						displayName: 'Interval',
						name: 'interval',
						type: 'options',
						options: intervalOptions,
						default: 'day',
					},
					{
						displayName: 'Requires Payment Method',
						name: 'requires_payment_method',
						type: 'boolean',
						default: true,
						description:
							'Whether customers must enter payment details to start the trial. Turn off for a cardless trial.',
					},
				],
			},
		],
		routing: { send: { type: 'body', property: 'trial_period', value: '={{ $value.trial }}' } },
	},
	{
		displayName: 'Type',
		name: 'type',
		type: 'options',
		options: catalogTypeOptions,
		default: 'standard',
		description: 'Standard prices are part of your catalog and shown in the Paddle dashboard',
		routing: { send: { type: 'body', property: 'type' } },
	},
];

const unitPriceAmountDescription =
	'Amount in the lowest denomination of the currency, e.g. 1000 for 10.00 USD';

export const priceDescription: INodeProperties[] = [
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
				action: 'Archive a price',
				description: 'Archive a price',
				routing: {
					request: {
						method: 'PATCH',
						url: '=/prices/{{$parameter.priceId}}',
						body: { status: 'archived' },
					},
					output: dataRootProperty,
				},
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create a price',
				description: 'Create a price for a product',
				routing: {
					request: { method: 'POST', url: '/prices' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a price',
				description: 'Get a price by ID',
				routing: {
					request: { method: 'GET', url: '=/prices/{{$parameter.priceId}}' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many prices',
				description: 'Get many prices, optionally filtered',
				routing: {
					request: { method: 'GET', url: '/prices' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a price',
				description: 'Update a price',
				routing: {
					request: { method: 'PATCH', url: '=/prices/{{$parameter.priceId}}' },
					output: dataRootProperty,
				},
			},
		],
		default: 'create',
	},

	resourceLocator({
		displayName: 'Price',
		name: 'priceId',
		searchListMethod: 'searchPrices',
		idPrefix: 'pri',
		show: showFor('archive', 'get', 'update'),
	}),

	// Get
	simplifyField(showFor('get'), simplifyPrice),

	// Create
	{
		...resourceLocator({
			displayName: 'Product',
			name: 'productId',
			searchListMethod: 'searchProducts',
			idPrefix: 'pro',
			description: 'The product this price is for',
			show: showFor('create'),
		}),
		routing: { send: { type: 'body', property: 'product_id' } },
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: showFor('create') },
		description: 'Internal description for the price, not shown to customers',
		routing: { send: { type: 'body', property: 'description' } },
	},
	{
		displayName: 'Unit Price Amount',
		name: 'unitPriceAmount',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 1000',
		displayOptions: { show: showFor('create') },
		description: unitPriceAmountDescription,
		routing: { send: { type: 'body', property: 'unit_price.amount' } },
	},
	{
		displayName: 'Currency',
		name: 'currencyCode',
		type: 'options',
		options: currencyOptions,
		required: true,
		default: 'USD',
		displayOptions: { show: showFor('create') },
		description: 'Currency of the unit price',
		routing: { send: { type: 'body', property: 'unit_price.currency_code' } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showFor('create') },
		options: priceFields(),
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
			...priceFields(),
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description: 'Internal description for the price, not shown to customers',
				routing: { send: { type: 'body', property: 'description', value: TEXT_VALUE } },
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: entityStatusOptions,
				default: 'active',
				description: 'Whether the price is active or archived',
				routing: { send: { type: 'body', property: 'status' } },
			},
			{
				displayName: 'Unit Price',
				name: 'unitPrice',
				type: 'fixedCollection',
				default: {},
				placeholder: 'Add Unit Price',
				options: [
					{
						displayName: 'Unit Price',
						name: 'price',
						values: [
							{
								displayName: 'Amount',
								name: 'amount',
								type: 'string',
								default: '',
								placeholder: 'e.g. 1000',
								description: unitPriceAmountDescription,
							},
							{
								displayName: 'Currency',
								name: 'currency_code',
								type: 'options',
								options: currencyOptions,
								default: 'USD',
							},
						],
					},
				],
				routing: {
					send: {
						type: 'body',
						property: 'unit_price',
						// Left out when Amount is blank, instead of sending "" which Paddle rejects.
						value:
							'={{ $value.price && String($value.price.amount).trim() ? $value.price : undefined }}',
					},
				},
			},
		],
	},

	// Get Many
	...getManyFields(showFor('getAll'), 200),
	simplifyField(showFor('getAll'), simplifyPrice),
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
				'Return only these price IDs (comma-separated)',
				'e.g. pri_01gsz8x8sawmvhz1pv30nge1ke',
			),
			queryFilter(
				'Product IDs',
				'productIds',
				'product_id',
				'Return only prices for these product IDs (comma-separated)',
				'e.g. pro_01gsz4t5hdjse780zja8vvr7jg',
			),
			{
				displayName: 'Recurring',
				name: 'recurring',
				type: 'boolean',
				default: true,
				description:
					'Whether to return only recurring prices (true) or only one-time prices (false)',
				routing: { send: { type: 'query', property: 'recurring' } },
			},
			multiQueryFilter('Status', 'status', 'status', entityStatusOptions),
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				options: catalogTypeOptions,
				default: 'standard',
				description: 'Return only prices of this type',
				routing: { send: { type: 'query', property: 'type' } },
			},
		],
	},
	sortField(showFor('getAll'), [
		{ name: 'Billing Frequency', value: 'billing_cycle.frequency' },
		{ name: 'Billing Interval', value: 'billing_cycle.interval' },
		{ name: 'Maximum Quantity', value: 'quantity.maximum' },
		{ name: 'Minimum Quantity', value: 'quantity.minimum' },
		{ name: 'Product ID', value: 'product_id' },
		{ name: 'Status', value: 'status' },
		{ name: 'Tax Mode', value: 'tax_mode' },
		{ name: 'Unit Price Amount', value: 'unit_price.amount' },
		{ name: 'Unit Price Currency', value: 'unit_price.currency_code' },
	]),
];
