import type {
	DeclarativeRestApiSettings,
	IDataObject,
	IExecutePaginationFunctions,
	INodeExecutionData,
} from 'n8n-workflow';

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
		const page = await this.makeRoutingRequest({
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
