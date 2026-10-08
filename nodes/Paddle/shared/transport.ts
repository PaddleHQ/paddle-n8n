import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IWebhookFunctions,
} from 'n8n-workflow';

export const BASE_URLS = {
	live: 'https://api.paddle.com',
	sandbox: 'https://sandbox-api.paddle.com',
} as const;

// Expression used by the declarative node's requestDefaults. Keep in sync with the
// credential test in PaddleBillingApi.credentials.ts.
export const BASE_URL_EXPRESSION = `={{$credentials.environment === "custom" ? String($credentials.baseUrl).replace(/\\/+$/, "") : $credentials.environment === "sandbox" ? "${BASE_URLS.sandbox}" : "${BASE_URLS.live}"}}`;

type PaddleCredentials = {
	environment?: keyof typeof BASE_URLS | 'custom';
	baseUrl?: string;
};

function resolveBaseUrl(credentials: PaddleCredentials): string {
	if (credentials.environment === 'custom' && credentials.baseUrl) {
		return credentials.baseUrl.replace(/\/+$/, '');
	}
	return credentials.environment === 'sandbox' ? BASE_URLS.sandbox : BASE_URLS.live;
}

export const PADDLE_HEADERS = {
	Accept: 'application/json',
	'Content-Type': 'application/json',
	'Paddle-Version': '1',
};

export type PaddleListResponse<T> = {
	data: T[];
	meta?: {
		pagination?: {
			per_page: number;
			next: string;
			has_more: boolean;
		};
	};
};

export async function paddleApiRequest(
	this: IHookFunctions | IExecuteFunctions | ILoadOptionsFunctions | IWebhookFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
	qs?: IDataObject,
	url?: string,
) {
	const credentials = await this.getCredentials<PaddleCredentials>('paddleBillingApi');
	const baseUrl = resolveBaseUrl(credentials);

	const options: IHttpRequestOptions = {
		method,
		url: url ?? `${baseUrl}${endpoint}`,
		headers: PADDLE_HEADERS,
		qs,
		body,
		json: true,
	};

	return this.helpers.httpRequestWithAuthentication.call(this, 'paddleBillingApi', options);
}
