import type {
	IDataObject,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	IN8nHttpFullResponse,
	ILoadOptionsFunctions,
	IWebhookFunctions,
} from 'n8n-workflow';
import { paddleApiError } from './errors';

export const BASE_URLS = {
	live: 'https://api.paddle.com',
	sandbox: 'https://sandbox-api.paddle.com',
} as const;

// Expression used by the declarative node's requestDefaults. Keep in sync with the
// credential test in PaddleBillingApi.credentials.ts.
export const BASE_URL_EXPRESSION = `={{$credentials.environment === "sandbox" ? "${BASE_URLS.sandbox}" : "${BASE_URLS.live}"}}`;

type PaddleCredentials = {
	environment?: keyof typeof BASE_URLS;
};

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
	this: IHookFunctions | ILoadOptionsFunctions | IWebhookFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
	qs?: IDataObject,
	url?: string,
) {
	const { environment } = await this.getCredentials<PaddleCredentials>('paddleBillingApi');
	const baseUrl = environment === 'sandbox' ? BASE_URLS.sandbox : BASE_URLS.live;

	const options: IHttpRequestOptions = {
		method,
		url: url ?? `${baseUrl}${endpoint}`,
		headers: PADDLE_HEADERS,
		qs,
		body,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};

	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'paddleBillingApi',
		options,
	)) as IN8nHttpFullResponse;

	if (response.statusCode >= 400) {
		throw paddleApiError(
			this.getNode(),
			response.statusCode,
			response.body,
			undefined,
			response.headers,
		);
	}
	return response.body as IDataObject;
}
