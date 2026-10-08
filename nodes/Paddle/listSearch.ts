import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { paddleApiRequest, type PaddleListResponse } from './shared/transport';

type PaddleEntity = IDataObject & { id: string };

type SearchConfig = {
	endpoint: string;
	perPage: number;
	label: (item: PaddleEntity) => string;
	// Query param Paddle filters on server-side; otherwise results are filtered by label.
	searchParam?: string;
	qs?: IDataObject;
};

function makeSearch(config: SearchConfig) {
	return async function (
		this: ILoadOptionsFunctions,
		filter?: string,
		paginationToken?: string,
	): Promise<INodeListSearchResult> {
		const qs: IDataObject = { per_page: config.perPage, ...config.qs };
		if (paginationToken) qs.after = paginationToken;
		if (filter && config.searchParam) qs[config.searchParam] = filter;

		const response = (await paddleApiRequest.call(
			this,
			'GET',
			config.endpoint,
			undefined,
			qs,
		)) as PaddleListResponse<PaddleEntity>;

		const needle = filter?.toLowerCase();
		const results: INodeListSearchItems[] = response.data
			.map((item) => ({ name: config.label(item), value: item.id }))
			.filter(
				(item) =>
					!needle ||
					config.searchParam ||
					item.name.toLowerCase().includes(needle) ||
					item.value.toLowerCase().includes(needle),
			);

		const last = response.data[response.data.length - 1];
		return {
			results,
			paginationToken: response.meta?.pagination?.has_more && last ? last.id : undefined,
		};
	};
}

const withId = (label: unknown, id: string) => (label ? `${String(label)} (${id})` : id);

export const searchCustomers = makeSearch({
	endpoint: '/customers',
	perPage: 200,
	searchParam: 'search',
	label: (c) => withId(c.name ? `${String(c.name)} <${String(c.email)}>` : c.email, c.id),
});

export const searchProducts = makeSearch({
	endpoint: '/products',
	perPage: 200,
	label: (p) => withId(p.name, p.id),
});

export const searchPrices = makeSearch({
	endpoint: '/prices',
	perPage: 200,
	label: (p) => withId(p.name ?? p.description, p.id),
});

export const searchDiscounts = makeSearch({
	endpoint: '/discounts',
	perPage: 200,
	label: (d) =>
		withId(d.code ? `${String(d.code)}: ${String(d.description)}` : d.description, d.id),
});

export const searchSubscriptions = makeSearch({
	endpoint: '/subscriptions',
	perPage: 200,
	label: (s) => `${s.id} (${String(s.status)})`,
});

export const searchTransactions = makeSearch({
	endpoint: '/transactions',
	perPage: 30,
	label: (t) => `${t.id} (${String(t.status)})`,
});
