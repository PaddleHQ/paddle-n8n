import type { INodeProperties } from 'n8n-workflow';
import {
	customDataField,
	dataRootProperty,
	entityStatusOptions,
	getManyFields,
	multiQueryFilter,
	queryFilter,
	resourceLocator,
	sortField,
} from '../shared/descriptions';

const show = { resource: ['customer'] };
const showFor = (...operation: string[]) => ({ ...show, operation });

const customerId = (operation: string[]) =>
	resourceLocator({
		displayName: 'Customer',
		name: 'customerId',
		searchListMethod: 'searchCustomers',
		idPrefix: 'ctm',
		show: { ...show, operation },
	});

const nameField: INodeProperties = {
	displayName: 'Name',
	name: 'name',
	type: 'string',
	default: '',
	description: 'Full name of the customer',
	routing: { send: { type: 'body', property: 'name' } },
};

const localeField: INodeProperties = {
	displayName: 'Locale',
	name: 'locale',
	type: 'string',
	default: '',
	placeholder: 'e.g. en',
	description: 'Valid IETF BCP 47 short form locale tag. Defaults to "en" in Paddle.',
	routing: { send: { type: 'body', property: 'locale' } },
};

export const customerDescription: INodeProperties[] = [
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
				action: 'Archive a customer',
				description: 'Archive a customer',
				routing: {
					request: {
						method: 'PATCH',
						url: '=/customers/{{$parameter.customerId}}',
						body: { status: 'archived' },
					},
					output: dataRootProperty,
				},
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create a customer',
				description: 'Create a customer',
				routing: {
					request: { method: 'POST', url: '/customers' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a customer',
				description: 'Get a customer by ID',
				routing: {
					request: { method: 'GET', url: '=/customers/{{$parameter.customerId}}' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many customers',
				description: 'Get many customers, optionally filtered',
				routing: {
					request: { method: 'GET', url: '/customers' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a customer',
				description: 'Update a customer',
				routing: {
					request: { method: 'PATCH', url: '=/customers/{{$parameter.customerId}}' },
					output: dataRootProperty,
				},
			},
		],
		default: 'create',
	},

	customerId(['archive', 'get', 'update']),

	// Create
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@email.com',
		required: true,
		default: '',
		displayOptions: { show: showFor('create') },
		description: 'Email address for the customer',
		routing: { send: { type: 'body', property: 'email' } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showFor('create') },
		options: [customDataField(), localeField, nameField],
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
			customDataField(),
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'Email address for the customer',
				routing: { send: { type: 'body', property: 'email' } },
			},
			localeField,
			nameField,
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: entityStatusOptions,
				default: 'active',
				description: 'Whether the customer is active or archived',
				routing: { send: { type: 'body', property: 'status' } },
			},
		],
	},

	// Get Many
	...getManyFields(showFor('getAll'), 200),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showFor('getAll') },
		options: [
			queryFilter(
				'Email',
				'email',
				'email',
				'Return customers with these exact email addresses (comma-separated)',
				'name@email.com',
			),
			queryFilter(
				'IDs',
				'ids',
				'id',
				'Return only these customer IDs (comma-separated)',
				'e.g. ctm_01h04vsc0qhwtsbsxh3422wjs4',
			),
			queryFilter(
				'Search',
				'search',
				'search',
				'Return customers whose ID, name or email matches this text',
			),
			multiQueryFilter('Status', 'status', 'status', entityStatusOptions),
		],
	},
	sortField(showFor('getAll')),
];
