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

	// The icon has its own background, so one file works on light and dark themes.
	icon: Icon = { light: 'file:../icons/paddle.svg', dark: 'file:../icons/paddle.svg' };

	documentationUrl = 'https://developer.paddle.com/api-reference/about/authentication?utm_source=dx&utm_medium=paddle-n8n';

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
			],
			default: 'live',
			description:
				'Use Sandbox for testing. API keys are not interchangeable between environments.',
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
				'={{$credentials.environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com"}}',
			url: '/event-types',
			method: 'GET',
		},
	};
}
