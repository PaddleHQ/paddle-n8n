import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import {
	collectionModeOptions,
	dataRootProperty,
	DATE_TIME_VALUE,
	getManyFields,
	multiQueryFilter,
	queryFilter,
	resourceLocator,
	simplifyField,
	sortField,
} from '../shared/descriptions';
import { simplifySubscription } from '../shared/simplify';

const show = { resource: ['subscription'] };
const showFor = (...operation: string[]) => ({ ...show, operation });

const effectiveFromOptions: INodePropertyOptions[] = [
	{ name: 'Immediately', value: 'immediately' },
	{
		name: 'Next Billing Period',
		value: 'next_billing_period',
		description: 'At the end of the current billing period',
	},
];

const onResumeOptions: INodePropertyOptions[] = [
	{
		name: 'Continue Existing Billing Period',
		value: 'continue_existing_billing_period',
		description: 'Keep the original billing dates; the customer may be charged immediately',
	},
	{
		name: 'Start New Billing Period',
		value: 'start_new_billing_period',
		description: 'Start a new billing period from the resume date',
	},
];

const onResumeField: INodeProperties = {
	displayName: 'On Resume',
	name: 'onResume',
	type: 'options',
	options: onResumeOptions,
	default: 'start_new_billing_period',
	description: 'How Paddle handles billing dates when the subscription resumes',
	routing: { send: { type: 'body', property: 'on_resume' } },
};

const subscriptionStatusOptions: INodePropertyOptions[] = [
	{ name: 'Active', value: 'active' },
	{ name: 'Canceled', value: 'canceled' },
	{ name: 'Past Due', value: 'past_due' },
	{ name: 'Paused', value: 'paused' },
	{ name: 'Trialing', value: 'trialing' },
];

export const subscriptionDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show },
		options: [
			{
				name: 'Cancel',
				value: 'cancel',
				action: 'Cancel a subscription',
				description: 'Cancel a subscription, immediately or at the end of the billing period',
				routing: {
					request: {
						method: 'POST',
						url: '=/subscriptions/{{$parameter.subscriptionId}}/cancel',
					},
					output: dataRootProperty,
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a subscription',
				description: 'Get a subscription by ID',
				routing: {
					request: { method: 'GET', url: '=/subscriptions/{{$parameter.subscriptionId}}' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many subscriptions',
				description: 'Get many subscriptions, optionally filtered',
				routing: {
					request: { method: 'GET', url: '/subscriptions' },
					output: dataRootProperty,
				},
			},
			{
				name: 'Pause',
				value: 'pause',
				action: 'Pause a subscription',
				description: 'Pause a subscription, immediately or at the end of the billing period',
				routing: {
					request: {
						method: 'POST',
						url: '=/subscriptions/{{$parameter.subscriptionId}}/pause',
					},
					output: dataRootProperty,
				},
			},
			{
				name: 'Resume',
				value: 'resume',
				action: 'Resume a subscription',
				description: 'Resume a paused subscription, immediately or on a date',
				routing: {
					request: {
						method: 'POST',
						url: '=/subscriptions/{{$parameter.subscriptionId}}/resume',
					},
					output: dataRootProperty,
				},
			},
		],
		default: 'get',
	},

	resourceLocator({
		displayName: 'Subscription',
		name: 'subscriptionId',
		searchListMethod: 'searchSubscriptions',
		idPrefix: 'sub',
		show: showFor('cancel', 'get', 'pause', 'resume'),
	}),

	// Get
	simplifyField(showFor('get'), simplifySubscription),

	// Cancel and Pause
	{
		displayName: 'Effective From',
		name: 'effectiveFrom',
		type: 'options',
		options: effectiveFromOptions,
		default: 'next_billing_period',
		displayOptions: { show: showFor('cancel', 'pause') },
		description:
			'When the change takes effect. Paused subscriptions can only be canceled immediately.',
		routing: { send: { type: 'body', property: 'effective_from' } },
	},
	{
		displayName: 'Options',
		name: 'pauseOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showFor('pause') },
		options: [
			onResumeField,
			{
				displayName: 'Resume At',
				name: 'resumeAt',
				type: 'dateTime',
				default: '',
				description:
					'When the subscription resumes automatically. Leave empty to pause until resumed manually.',
				routing: { send: { type: 'body', property: 'resume_at', value: DATE_TIME_VALUE } },
			},
		],
	},

	// Resume
	{
		displayName: 'Resume',
		name: 'resumeWhen',
		type: 'options',
		options: [
			{ name: 'Immediately', value: 'immediately' },
			{ name: 'On a Date', value: 'onDate' },
		],
		default: 'immediately',
		displayOptions: { show: showFor('resume') },
		description: 'When the subscription resumes',
		routing: {
			send: {
				type: 'body',
				property: 'effective_from',
				value: '={{ $value === "immediately" ? "immediately" : undefined }}',
			},
		},
	},
	{
		displayName: 'Resume At',
		name: 'resumeAt',
		type: 'dateTime',
		required: true,
		default: '',
		displayOptions: { show: { ...showFor('resume'), resumeWhen: ['onDate'] } },
		description: 'Date and time the subscription resumes',
		routing: { send: { type: 'body', property: 'effective_from', value: DATE_TIME_VALUE } },
	},
	{
		displayName: 'Options',
		name: 'resumeOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showFor('resume') },
		options: [onResumeField],
	},

	// Get
	{
		displayName: 'Options',
		name: 'getOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showFor('get') },
		options: [
			{
				displayName: 'Include',
				name: 'include',
				type: 'multiOptions',
				options: [
					{
						name: 'Next Transaction',
						value: 'next_transaction',
						description: 'Preview of the next transaction for this subscription',
					},
					{
						name: 'Recurring Transaction Details',
						value: 'recurring_transaction_details',
						description: 'Preview of the recurring transaction for this subscription',
					},
				],
				default: [],
				description: 'Related data to include in the response',
				routing: { send: { type: 'query', property: 'include', value: '={{ $value.join(",") }}' } },
			},
		],
	},

	// Get Many
	...getManyFields(showFor('getAll'), 200),
	simplifyField(showFor('getAll'), simplifySubscription),
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
				description: 'Return only subscriptions with this collection mode',
				routing: { send: { type: 'query', property: 'collection_mode' } },
			},
			queryFilter(
				'Customer IDs',
				'customerIds',
				'customer_id',
				'Return only subscriptions for these customer IDs (comma-separated)',
				'e.g. ctm_01h04vsc0qhwtsbsxh3422wjs4',
			),
			queryFilter(
				'IDs',
				'ids',
				'id',
				'Return only these subscription IDs (comma-separated)',
				'e.g. sub_01h04vsc0qhwtsbsxh3422wjs4',
			),
			queryFilter(
				'Price IDs',
				'priceIds',
				'price_id',
				'Return only subscriptions containing these price IDs (comma-separated)',
				'e.g. pri_01gsz8x8sawmvhz1pv30nge1ke',
			),
			multiQueryFilter(
				'Scheduled Change',
				'scheduledChangeAction',
				'scheduled_change_action',
				[
					{ name: 'Cancel', value: 'cancel' },
					{ name: 'Pause', value: 'pause' },
					{ name: 'Resume', value: 'resume' },
				],
				'Return only subscriptions with these scheduled changes',
			),
			multiQueryFilter('Status', 'status', 'status', subscriptionStatusOptions),
		],
	},
	sortField(showFor('getAll')),
];
