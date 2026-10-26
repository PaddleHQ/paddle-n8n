import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import {
	currencyOptions,
	customDataField,
	dataRootProperty,
	DATE_TIME_VALUE,
	entityStatusOptions,
	getManyFields,
	LIST_VALUE,
	multiQueryFilter,
	queryFilter,
	resourceLocator,
	simplifyField,
	sortField,
	TEXT_VALUE,
} from '../shared/descriptions';
import { simplifyDiscount } from '../shared/simplify';

const show = { resource: ['discount'] };
const showFor = (...operation: string[]) => ({ ...show, operation });

const discountTypeOptions: INodePropertyOptions[] = [
	{ name: 'Flat', value: 'flat', description: 'Fixed amount off the total' },
	{
		name: 'Flat Per Seat',
		value: 'flat_per_seat',
		description: 'Fixed amount off per unit of quantity',
	},
	{ name: 'Percentage', value: 'percentage', description: 'Percentage off the total' },
];

const currencyField = (extra: Partial<INodeProperties> = {}): INodeProperties => ({
	displayName: 'Currency',
	name: 'currencyCode',
	type: 'options',
	options: currencyOptions,
	default: 'USD',
	description: 'Currency of the amount. Required for flat and flat per seat discounts.',
	routing: { send: { type: 'body', property: 'currency_code' } },
	...extra,
});

const descriptionText = 'Short description for your reference. Not shown to customers.';

const amountDescription =
	'Percentage (e.g. 10 for 10%) for percentage discounts, or an amount in the lowest denomination of the currency (e.g. 500 for 5.00 USD) for flat discounts';

// Optional discount fields shared by Create and Update
const discountFields = (): INodeProperties[] => [
	{
		displayName: 'Code',
		name: 'code',
		type: 'string',
		default: '',
		description:
			'Code customers enter at checkout. If empty and Enabled for Checkout is on, Paddle generates a random code.',
		routing: { send: { type: 'body', property: 'code', value: TEXT_VALUE } },
	},
	customDataField(),
	{
		displayName: 'Enabled for Checkout',
		name: 'enabledForCheckout',
		type: 'boolean',
		default: true,
		description: 'Whether customers can redeem this discount at checkout',
		routing: { send: { type: 'body', property: 'enabled_for_checkout' } },
	},
	{
		displayName: 'Expires At',
		name: 'expiresAt',
		type: 'dateTime',
		default: '',
		description: 'When the discount stops being redeemable',
		routing: { send: { type: 'body', property: 'expires_at', value: DATE_TIME_VALUE } },
	},
	{
		displayName: 'Maximum Recurring Intervals',
		name: 'maximumRecurringIntervals',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 1,
		description:
			'Number of subscription billing periods the discount recurs for. Requires Recur to be on.',
		routing: { send: { type: 'body', property: 'maximum_recurring_intervals' } },
	},
	{
		displayName: 'Recur',
		name: 'recur',
		type: 'boolean',
		default: false,
		description:
			'Whether the discount applies to subscription renewals as well as the first payment',
		routing: { send: { type: 'body', property: 'recur' } },
	},
	{
		displayName: 'Restrict To',
		name: 'restrictTo',
		type: 'string',
		default: '',
		placeholder: 'e.g. pro_01gsz4t5hdjse780zja8vvr7jg, pri_01gsz8x8sawmvhz1pv30nge1ke',
		description: 'Product or price IDs the discount is limited to (comma-separated)',
		routing: { send: { type: 'body', property: 'restrict_to', value: LIST_VALUE } },
	},
	{
		displayName: 'Usage Limit',
		name: 'usageLimit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 1,
		description: 'Maximum number of times the discount can be redeemed across all customers',
		routing: { send: { type: 'body', property: 'usage_limit' } },
	},
];

export const discountDescription: INodeProperties[] = [
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
				action: 'Archive a discount',
				description: 'Archive a discount',
				routing: {
					request: {
						method: 'PATCH',
						url: '=/discounts/{{$parameter.discountId}}',
						body: { status: 'archived' },
					},
					output: dataRootProperty,
				},
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create a discount',
				description: 'Create a discount',
				routing: {
					request: { method: 'POST', url: '/discounts' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a discount',
				description: 'Get a discount by ID',
				routing: {
					request: { method: 'GET', url: '=/discounts/{{$parameter.discountId}}' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many discounts',
				description: 'Get many discounts, optionally filtered',
				routing: {
					request: { method: 'GET', url: '/discounts' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a discount',
				description: 'Update a discount',
				routing: {
					request: { method: 'PATCH', url: '=/discounts/{{$parameter.discountId}}' },
					output: dataRootProperty,
				},
			},
		],
		default: 'create',
	},

	resourceLocator({
		displayName: 'Discount',
		name: 'discountId',
		searchListMethod: 'searchDiscounts',
		idPrefix: 'dsc',
		show: showFor('archive', 'get', 'update'),
	}),

	// Get
	simplifyField(showFor('get'), simplifyDiscount),

	// Create
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: showFor('create') },
		description: descriptionText,
		routing: { send: { type: 'body', property: 'description' } },
	},
	{
		displayName: 'Type',
		name: 'type',
		type: 'options',
		options: discountTypeOptions,
		required: true,
		default: 'percentage',
		displayOptions: { show: showFor('create') },
		description: 'How the discount is calculated',
		routing: { send: { type: 'body', property: 'type' } },
	},
	{
		displayName: 'Amount',
		name: 'amount',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 10',
		displayOptions: { show: showFor('create') },
		description: amountDescription,
		routing: { send: { type: 'body', property: 'amount' } },
	},
	currencyField({
		required: true,
		displayOptions: { show: { ...showFor('create'), type: ['flat', 'flat_per_seat'] } },
	}),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showFor('create') },
		options: discountFields(),
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
			...discountFields(),
			currencyField(),
			{
				displayName: 'Amount',
				name: 'amount',
				type: 'string',
				default: '',
				placeholder: 'e.g. 10',
				description: amountDescription,
				routing: { send: { type: 'body', property: 'amount', value: TEXT_VALUE } },
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description: descriptionText,
				routing: { send: { type: 'body', property: 'description', value: TEXT_VALUE } },
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: entityStatusOptions,
				default: 'active',
				description: 'Whether the discount is active or archived',
				routing: { send: { type: 'body', property: 'status' } },
			},
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				options: discountTypeOptions,
				default: 'percentage',
				description: 'How the discount is calculated',
				routing: { send: { type: 'body', property: 'type' } },
			},
		],
	},

	// Get Many
	...getManyFields(showFor('getAll'), 200),
	simplifyField(showFor('getAll'), simplifyDiscount),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showFor('getAll') },
		options: [
			queryFilter(
				'Codes',
				'codes',
				'code',
				'Return only discounts with these codes (comma-separated)',
				'e.g. BLACKFRIDAY',
			),
			queryFilter(
				'IDs',
				'ids',
				'id',
				'Return only these discount IDs (comma-separated)',
				'e.g. dsc_01gv5kpg05xp104ek2fmgjwttf',
			),
			multiQueryFilter('Status', 'status', 'status', entityStatusOptions),
		],
	},
	sortField(showFor('getAll'), [{ name: 'Created At', value: 'created_at' }]),
];
