import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import {
	collectionModeOptions,
	currencyOptions,
	customDataField,
	dataRootProperty,
	getManyFields,
	multiQueryFilter,
	queryFilter,
	resourceLocator,
	simplifyField,
	sortField,
} from '../shared/descriptions';
import { simplifyTransaction } from '../shared/simplify';

const show = { resource: ['transaction'] };
const showFor = (...operation: string[]) => ({ ...show, operation });

const transactionStatusOptions: INodePropertyOptions[] = [
	{ name: 'Billed', value: 'billed' },
	{ name: 'Canceled', value: 'canceled' },
	{ name: 'Completed', value: 'completed' },
	{ name: 'Draft', value: 'draft' },
	{ name: 'Paid', value: 'paid' },
	{ name: 'Past Due', value: 'past_due' },
	{ name: 'Ready', value: 'ready' },
];

const includeOptions: INodePropertyOptions[] = [
	{ name: 'Address', value: 'address' },
	{ name: 'Adjustments', value: 'adjustments' },
	{ name: 'Adjustments Totals', value: 'adjustments_totals' },
	{ name: 'Available Payment Methods', value: 'available_payment_methods' },
	{ name: 'Business', value: 'business' },
	{ name: 'Customer', value: 'customer' },
	{ name: 'Discount', value: 'discount' },
];

const includeField: INodeProperties = {
	displayName: 'Include',
	name: 'include',
	type: 'multiOptions',
	options: includeOptions,
	default: [],
	description: 'Related entities to include in the response',
	routing: { send: { type: 'query', property: 'include', value: '={{ $value.join(",") }}' } },
};

const idField = (displayName: string, name: string, property: string, example: string) =>
	({
		displayName,
		name,
		type: 'string',
		default: '',
		placeholder: `e.g. ${example}`,
		routing: { send: { type: 'body', property } },
	}) as INodeProperties;

export const transactionDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a transaction',
				description: 'Create a transaction',
				routing: {
					request: { method: 'POST', url: '/transactions' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a transaction',
				description: 'Get a transaction by ID',
				routing: {
					request: { method: 'GET', url: '=/transactions/{{$parameter.transactionId}}' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many transactions',
				description: 'Get many transactions, optionally filtered',
				routing: {
					request: { method: 'GET', url: '/transactions' },
					output: dataRootProperty,
				},
			},
		],
		default: 'create',
	},

	resourceLocator({
		displayName: 'Transaction',
		name: 'transactionId',
		searchListMethod: 'searchTransactions',
		idPrefix: 'txn',
		show: showFor('get'),
	}),

	// Get
	simplifyField(showFor('get'), simplifyTransaction),

	// Create
	{
		displayName: 'Items',
		name: 'items',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		required: true,
		default: { item: [{ priceId: '', quantity: 1 }] },
		placeholder: 'Add Item',
		displayOptions: { show: showFor('create') },
		description: 'Prices to bill and their quantities',
		options: [
			{
				displayName: 'Item',
				name: 'item',
				values: [
					{
						displayName: 'Price ID',
						name: 'priceId',
						type: 'string',
						default: '',
						placeholder: 'e.g. pri_01gsz8x8sawmvhz1pv30nge1ke',
						description: 'ID of the price to bill',
					},
					{
						displayName: 'Quantity',
						name: 'quantity',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1,
					},
				],
			},
		],
		routing: {
			send: {
				type: 'body',
				property: 'items',
				value:
					'={{ ($value.item || []).map((i) => ({ price_id: i.priceId, quantity: i.quantity })) }}',
			},
		},
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showFor('create') },
		options: [
			idField('Address ID', 'addressId', 'address_id', 'add_01gm302t81w94gyjpjpqypkzkf'),
			idField('Business ID', 'businessId', 'business_id', 'biz_01gm302t81w94gyjpjpqypkzkf'),
			{
				displayName: 'Collection Mode',
				name: 'collectionMode',
				type: 'options',
				options: collectionModeOptions,
				default: 'automatic',
				description:
					'How payment is collected. Manual transactions need a customer, address and billing details.',
				routing: { send: { type: 'body', property: 'collection_mode' } },
			},
			{
				displayName: 'Currency',
				name: 'currencyCode',
				type: 'options',
				options: currencyOptions,
				default: 'USD',
				description: 'Currency for the transaction',
				routing: { send: { type: 'body', property: 'currency_code' } },
			},
			customDataField(),
			idField('Customer ID', 'customerId', 'customer_id', 'ctm_01h04vsc0qhwtsbsxh3422wjs4'),
			idField('Discount ID', 'discountId', 'discount_id', 'dsc_01gv5kpg05xp104ek2fmgjwttf'),
		],
	},

	// Get
	{
		displayName: 'Options',
		name: 'getOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showFor('get') },
		options: [includeField],
	},

	// Get Many
	...getManyFields(showFor('getAll'), 30),
	simplifyField(showFor('getAll'), simplifyTransaction),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showFor('getAll') },
		options: [
			{
				displayName: 'Collection Mode',
				name: 'collectionMode',
				type: 'options',
				options: collectionModeOptions,
				default: 'automatic',
				description: 'Return only transactions with this collection mode',
				routing: { send: { type: 'query', property: 'collection_mode' } },
			},
			queryFilter(
				'Customer IDs',
				'customerIds',
				'customer_id',
				'Return only transactions for these customer IDs (comma-separated)',
				'e.g. ctm_01h04vsc0qhwtsbsxh3422wjs4',
			),
			queryFilter(
				'IDs',
				'ids',
				'id',
				'Return only these transaction IDs (comma-separated)',
				'e.g. txn_01h04vsc0qhwtsbsxh3422wjs4',
			),
			includeField,
			queryFilter(
				'Invoice Numbers',
				'invoiceNumbers',
				'invoice_number',
				'Return only transactions with these invoice numbers (comma-separated)',
				'e.g. 123-45678',
			),
			multiQueryFilter('Status', 'status', 'status', transactionStatusOptions),
			queryFilter(
				'Subscription IDs',
				'subscriptionIds',
				'subscription_id',
				'Return only transactions for these subscription IDs (comma-separated)',
				'e.g. sub_01h04vsc0qhwtsbsxh3422wjs4',
			),
		],
	},
	sortField(showFor('getAll'), [
		{ name: 'Billed At', value: 'billed_at' },
		{ name: 'Created At', value: 'created_at' },
		{ name: 'Updated At', value: 'updated_at' },
	]),
];
