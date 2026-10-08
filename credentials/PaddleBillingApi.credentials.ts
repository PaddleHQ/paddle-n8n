import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class PaddleBillingApi implements ICredentialType {
	name = 'paddleBillingApi';

	displayName = 'Paddle Billing API';

	icon: Icon = { light: 'file:../icons/paddle.svg', dark: 'file:../icons/paddle.dark.svg' };

	documentationUrl = 'https://developer.paddle.com/api-reference/about/authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Create an API key in Paddle under Developer Tools > Authentication. The key must belong to the environment selected below.',
		},
		{
			displayName: 'Environment',
			name: 'environment',
			type: 'options',
			options: [
				{
					name: 'Live',
					value: 'live',
				},
				{
					name: 'Sandbox',
					value: 'sandbox',
				},
				{
					name: 'Custom',
					value: 'custom',
					description: 'Another Paddle API host, such as an internal development environment',
				},
			],
			default: 'live',
			description:
				'Use Sandbox for testing. API keys are not interchangeable between environments.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'e.g. https://api.example.com',
			description: 'Base URL of the Paddle API, without a trailing path',
			displayOptions: {
				show: {
					environment: ['custom'],
				},
			},
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL:
				'={{$credentials.environment === "custom" ? String($credentials.baseUrl).replace(/\\/+$/, "") : $credentials.environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com"}}',
			url: '/event-types',
			method: 'GET',
		},
	};
}
