import {
	NodeApiError,
	sleep,
	type DeclarativeRestApiSettings,
	type IDataObject,
	type IExecutePaginationFunctions,
	type INodeExecutionData,
	type JsonObject,
} from 'n8n-workflow';

// Paddle rate limits by IP address and blocks it for 60 seconds once exceeded. Waiting
// and retrying keeps the pages already fetched instead of failing the whole run.
const RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_WAIT_SECONDS = 60;

type RateLimitError = { httpCode?: string; context?: { retryAfterSeconds?: number } };

async function requestPage(
	this: IExecutePaginationFunctions,
	requestData: DeclarativeRestApiSettings.ResultOptions,
): Promise<INodeExecutionData[]> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await this.makeRoutingRequest(requestData);
		} catch (error) {
			const { httpCode, context } = error as RateLimitError;
			if (httpCode !== '429' || attempt >= RATE_LIMIT_RETRIES) {
				throw new NodeApiError(this.getNode(), error as JsonObject);
			}
			const seconds = Math.min(context?.retryAfterSeconds ?? RATE_LIMIT_WAIT_SECONDS, 60);
			await sleep(seconds * 1000);
		}
	}
}

// Paddle list endpoints use cursor pagination: the next page is requested with
// `after` set to the last ID of the previous page. n8n's built-in "generic"
// pagination replaces the whole query string (dropping filters) and cannot stop
// at a limit, so this walks the pages itself and stops once `maxResults` is met.
export async function paddlePagination(
	this: IExecutePaginationFunctions,
	requestData: DeclarativeRestApiSettings.ResultOptions,
): Promise<INodeExecutionData[]> {
	const results: INodeExecutionData[] = [];
	const maxResults = requestData.maxResults ? Number(requestData.maxResults) : Infinity;
	const qs: IDataObject = { ...(requestData.options.qs as IDataObject) };
	const perPage = Number(qs.per_page) || 50;

	while (results.length < maxResults) {
		const page = await requestPage.call(this, {
			...requestData,
			options: { ...requestData.options, qs: { ...qs } },
		});
		results.push(...page);

		const lastId = page[page.length - 1]?.json.id;
		if (page.length < perPage || typeof lastId !== 'string') break;
		qs.after = lastId;
	}

	return results.slice(0, maxResults);
}
