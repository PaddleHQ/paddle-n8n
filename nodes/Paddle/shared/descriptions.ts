import type {
	IDataObject,
	IExecuteSingleFunctions,
	INodeExecutionData,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';
import { throwOnPaddleError } from './errors';
import { paddlePagination } from './pagination';

type DisplayShow = Record<string, string[]>;

const CURRENCY_CODES = [
	'ARS',
	'AUD',
	'BRL',
	'CAD',
	'CHF',
	'CLP',
	'CNY',
	'COP',
	'CZK',
	'DKK',
	'EUR',
	'GBP',
	'HKD',
	'HUF',
	'ILS',
	'INR',
	'JPY',
	'KRW',
	'MXN',
	'NOK',
	'NZD',
	'PEN',
	'PLN',
	'RUB',
	'SEK',
	'SGD',
	'THB',
	'TRY',
	'TWD',
	'UAH',
	'USD',
	'VND',
	'ZAR',
];

export const currencyOptions: INodePropertyOptions[] = CURRENCY_CODES.map((code) => ({
	name: code,
	value: code,
}));

export const intervalOptions: INodePropertyOptions[] = [
	{ name: 'Day', value: 'day' },
	{ name: 'Month', value: 'month' },
	{ name: 'Week', value: 'week' },
	{ name: 'Year', value: 'year' },
];

export const catalogTypeOptions: INodePropertyOptions[] = [
	{ name: 'Custom', value: 'custom', description: 'Not shown in the Paddle catalog' },
	{ name: 'Standard', value: 'standard', description: 'Part of your catalog' },
];

export const entityStatusOptions: INodePropertyOptions[] = [
	{ name: 'Active', value: 'active' },
	{ name: 'Archived', value: 'archived' },
];

export const collectionModeOptions: INodePropertyOptions[] = [
	{ name: 'Automatic', value: 'automatic', description: 'Payment is collected automatically' },
	{ name: 'Manual', value: 'manual', description: 'Paddle sends an invoice to be paid' },
];

// Paddle expects RFC 3339 timestamps; n8n date pickers may omit the offset. A blank
// optional date is left out of the request instead of failing with "Invalid time value".
export const DATE_TIME_VALUE = '={{ $value ? new Date($value).toISOString() : undefined }}';

// Accepts either a JSON string (typed in the editor) or an object (from an expression).
export const JSON_VALUE = '={{ typeof $value === "string" ? JSON.parse($value) : $value }}';

// Comma-separated list input, sent to Paddle as an array.
export const LIST_VALUE =
	'={{ (Array.isArray($value) ? $value : String($value).split(",")).map((v) => String(v).trim()).filter((v) => v) }}';

export function resourceLocator(options: {
	displayName: string;
	name: string;
	searchListMethod: string;
	idPrefix: string;
	required?: boolean;
	description?: string;
	show: DisplayShow;
}): INodeProperties {
	return {
		displayName: options.displayName,
		name: options.name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: options.required ?? true,
		description: options.description,
		displayOptions: { show: options.show },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: options.searchListMethod,
					searchable: true,
				},
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: `e.g. ${options.idPrefix}_01h04vsc0qhwtsbsxh3422wjs4`,
				validation: [
					{
						type: 'regex',
						properties: {
							regex: `^${options.idPrefix}_[a-z0-9]+$`,
							errorMessage: `Not a valid Paddle ID (expected ${options.idPrefix}_...)`,
						},
					},
				],
			},
		],
	};
}

export function customDataField(): INodeProperties {
	return {
		displayName: 'Custom Data',
		name: 'customData',
		type: 'json',
		default: '{}',
		description:
			'Your own structured key-value data as a JSON object. Replaces any existing custom data.',
		routing: {
			send: {
				type: 'body',
				property: 'custom_data',
				value: JSON_VALUE,
			},
		},
	};
}

// "Return All" + "Limit" for a Paddle list endpoint. `maxPerPage` is the endpoint's
// page size cap; limits above it are fetched over several pages (see paddlePagination).
export function getManyFields(show: DisplayShow, maxPerPage: number): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			displayOptions: { show },
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			routing: {
				send: {
					paginate: true,
					type: 'query',
					property: 'per_page',
					value: String(maxPerPage),
				},
				operations: {
					pagination: paddlePagination,
				},
			},
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			displayOptions: { show: { ...show, returnAll: [false] } },
			typeOptions: {
				minValue: 1,
			},
			default: 50,
			description: 'Max number of results to return',
			routing: {
				send: {
					type: 'query',
					property: 'per_page',
					value: `={{ Math.min($value, ${maxPerPage}) }}`,
				},
				output: {
					maxResults: '={{ $value }}',
				},
			},
		},
	];
}

// Query-string filter that accepts one or more values, sent comma-separated.
export function multiQueryFilter(
	displayName: string,
	name: string,
	query: string,
	options: INodePropertyOptions[],
	description?: string,
): INodeProperties {
	return {
		displayName,
		name,
		type: 'multiOptions',
		options,
		default: [],
		description,
		routing: {
			send: {
				type: 'query',
				property: query,
				value: '={{ $value.join(",") }}',
			},
		},
	};
}

export function queryFilter(
	displayName: string,
	name: string,
	query: string,
	description: string,
	placeholder?: string,
): INodeProperties {
	return {
		displayName,
		name,
		type: 'string',
		default: '',
		placeholder,
		description,
		routing: {
			send: {
				type: 'query',
				property: query,
				// Paddle takes comma-separated lists; drop whitespace around the commas.
				value: '={{ String($value).split(",").map((v) => v.trim()).filter((v) => v).join(",") }}',
			},
		},
	};
}

// Every operation's output: raise Paddle errors, then unwrap Paddle's `data` envelope.
export const dataRootProperty = {
	postReceive: [
		throwOnPaddleError,
		{
			type: 'rootProperty' as const,
			properties: { property: 'data' },
		},
	],
};

// "Sort" collection for Get Many, sent as Paddle's `order_by=<field>[ASC|DESC]`.
// `fields` lists the endpoint's sortable fields other than ID; Paddle can always sort by ID.
export function sortField(show: DisplayShow, fields: INodePropertyOptions[] = []): INodeProperties {
	const orderBy =
		'={{ ($parameter.sort.field || "id") + "[" + ($parameter.sort.direction || "DESC") + "]" }}';
	const send = { type: 'query' as const, property: 'order_by', value: orderBy };

	const options: INodeProperties[] = [
		{
			displayName: 'Direction',
			name: 'direction',
			type: 'options',
			options: [
				{ name: 'Ascending', value: 'ASC' },
				{ name: 'Descending', value: 'DESC' },
			],
			default: 'DESC',
			description: fields.length
				? 'Order of the results'
				: 'Order of the results by ID. Paddle IDs increase over time, so Descending returns the newest first.',
			routing: { send },
		},
	];
	if (fields.length) {
		options.push({
			displayName: 'Sort By',
			name: 'field',
			type: 'options',
			options: [{ name: 'ID', value: 'id' }, ...fields].sort((a, b) =>
				a.name.localeCompare(b.name),
			),
			default: 'id',
			description: 'Field to sort the results by',
			routing: { send },
		});
	}

	return {
		displayName: 'Sort',
		name: 'sort',
		type: 'collection',
		placeholder: 'Add Sort Option',
		default: {},
		displayOptions: { show },
		description: 'By default, Paddle returns the newest records first',
		options,
	};
}

// "Simplify" toggle for Get and Get Many. `simplify` picks at most 10 fields, flattened
// where possible, from one Paddle record.
export function simplifyField(
	show: DisplayShow,
	simplify: (record: IDataObject) => IDataObject,
): INodeProperties {
	return {
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		displayOptions: { show },
		description: 'Whether to return a simplified version of the response instead of the raw data',
		routing: {
			output: {
				postReceive: [
					async function (
						this: IExecuteSingleFunctions,
						items: INodeExecutionData[],
					): Promise<INodeExecutionData[]> {
						if (!this.getNodeParameter('simplify', true)) return items;
						return items.map((item) => ({ ...item, json: simplify(item.json) }));
					},
				],
			},
		},
	};
}
