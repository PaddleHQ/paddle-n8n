// In-memory stand-in for the Paddle Billing API, served over HTTPS so n8n can be
// pointed at it by resolving sandbox-api.paddle.com to this host. It records
// every request so tests can assert exactly what the node sent.
import https from 'node:https';
import { randomBytes } from 'node:crypto';

export const API_KEY = 'pdl_sdbx_apikey_e2e';
export const FORBIDDEN_KEY = 'pdl_sdbx_forbidden';

const PREFIX = {
	customers: 'ctm',
	products: 'pro',
	prices: 'pri',
	discounts: 'dsc',
	subscriptions: 'sub',
	transactions: 'txn',
	'notification-settings': 'ntfset',
};

const PAGE_CAP = { transactions: 30 };

export const EVENT_TYPES = [
	'customer.created',
	'customer.updated',
	'subscription.activated',
	'subscription.canceled',
	'subscription.created',
	'transaction.completed',
].map((name) => ({ name, description: `Occurs on ${name}`, group: name.split('.')[0] }));

const id = (prefix, n) => `${prefix}_01e2e${String(n).padStart(6, '0')}`;
const iso = (n) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();

function seed() {
	const db = Object.fromEntries(Object.keys(PREFIX).map((k) => [k, new Map()]));
	const put = (col, record) => db[col].set(record.id, record);

	for (let n = 1; n <= 450; n++) {
		put('customers', {
			id: id('ctm', n),
			name: n % 7 === 0 ? null : `Customer ${n}`,
			email: `customer${n}@example.com`,
			status: n % 10 === 0 ? 'archived' : 'active',
			locale: 'en',
			custom_data: null,
			created_at: iso(n),
			updated_at: iso(n),
		});
	}
	for (let n = 1; n <= 5; n++) {
		put('products', {
			id: id('pro', n),
			name: `Product ${n}`,
			description: `Description ${n}`,
			type: 'standard',
			tax_category: 'saas',
			image_url: null,
			custom_data: null,
			status: 'active',
			created_at: iso(n),
			updated_at: iso(n),
		});
	}
	for (let n = 1; n <= 10; n++) {
		put('prices', {
			id: id('pri', n),
			product_id: id('pro', (n % 5) + 1),
			name: n % 2 ? `Price ${n}` : null,
			description: `Price description ${n}`,
			type: 'standard',
			status: 'active',
			unit_price: { amount: String(n * 1000), currency_code: 'USD' },
			billing_cycle: n % 3 ? { interval: 'month', frequency: 1 } : null,
			created_at: iso(n),
		});
	}
	for (let n = 1; n <= 3; n++) {
		put('discounts', {
			id: id('dsc', n),
			code: n === 1 ? null : `CODE${n}`,
			description: `Discount ${n}`,
			status: 'active',
			type: 'percentage',
			amount: '10',
			currency_code: null,
			recur: false,
			times_used: 0,
			expires_at: null,
		});
	}
	for (let n = 1; n <= 40; n++) {
		put('subscriptions', {
			id: id('sub', n),
			status: n % 4 === 0 ? 'past_due' : 'active',
			customer_id: id('ctm', n),
			currency_code: 'USD',
			collection_mode: 'automatic',
			billing_cycle: { interval: 'month', frequency: 1 },
			next_billed_at: iso(n),
			scheduled_change: null,
			items: [{ price: { id: id('pri', 1) } }, { price: { id: id('pri', 2) } }],
		});
	}
	for (let n = 1; n <= 65; n++) {
		put('transactions', {
			id: id('txn', n),
			status: 'completed',
			customer_id: id('ctm', n),
			subscription_id: id('sub', (n % 40) + 1),
			invoice_number: `INV-${n}`,
			currency_code: 'USD',
			origin: 'web',
			details: { totals: { grand_total: String(n * 100) } },
			billed_at: iso(n),
			created_at: iso(n),
		});
	}
	return db;
}

const envelope = (data, extra = {}) => ({
	data,
	meta: { request_id: `req_${randomBytes(6).toString('hex')}`, ...extra },
});

const error = (status, code, detail, extra = {}) => ({
	status,
	body: {
		error: {
			type: status >= 500 ? 'api_error' : 'request_error',
			code,
			detail,
			documentation_url: `https://developer.paddle.com/errors/${code}`,
			...extra,
		},
		meta: { request_id: `req_${randomBytes(6).toString('hex')}` },
	},
});

const parseOrderBy = (value) => {
	const match = /^(.+)\[(ASC|DESC)\]$/.exec(value ?? '');
	return match ? { field: match[1], dir: match[2] } : { field: 'id', dir: 'DESC' };
};

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

function list(records, query, cap) {
	const csv = (v) => String(v).split(',');
	let rows = [...records];
	for (const [key, value] of Object.entries(query)) {
		if (['per_page', 'after', 'order_by', 'include', 'recurring', 'collection_mode'].includes(key))
			continue;
		if (key === 'search') {
			const needle = value.toLowerCase();
			rows = rows.filter((r) =>
				[r.id, r.name, r.email].some((f) =>
					String(f ?? '')
						.toLowerCase()
						.includes(needle),
				),
			);
			continue;
		}
		const wanted = csv(value);
		rows = rows.filter((r) => wanted.includes(String(get(r, key))));
	}
	const { field, dir } = parseOrderBy(query.order_by);
	rows.sort((a, b) => {
		const x = String(get(a, field) ?? '');
		const y = String(get(b, field) ?? '');
		return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'ASC' ? 1 : -1);
	});
	const perPage = Math.min(Number(query.per_page) || 50, cap ?? 200);
	const start = query.after ? rows.findIndex((r) => r.id === query.after) + 1 : 0;
	const page = rows.slice(start, start + perPage);
	const hasMore = start + perPage < rows.length;
	return envelope(page, {
		pagination: {
			per_page: perPage,
			next: hasMore ? `?after=${page[page.length - 1]?.id}` : null,
			has_more: hasMore,
			estimated_total: rows.length,
		},
	});
}

export function createMockPaddle({ cert, key }) {
	const db = seed();
	const requests = [];
	let counter = 0;

	const handle = (req, body) => {
		const url = new URL(req.url, 'https://sandbox-api.paddle.com');
		const query = Object.fromEntries(url.searchParams);
		const segments = url.pathname.split('/').filter(Boolean);

		requests.push({
			method: req.method,
			path: url.pathname,
			query,
			headers: {
				authorization: req.headers.authorization
					? req.headers.authorization.replace(/Bearer .+/, 'Bearer ***')
					: undefined,
				'paddle-version': req.headers['paddle-version'],
				'content-type': req.headers['content-type'],
				accept: req.headers.accept,
			},
			body,
		});

		// Paddle answers every authentication failure with 403; the code tells them apart.
		const auth = req.headers.authorization ?? '';
		if (auth === `Bearer ${FORBIDDEN_KEY}` || !auth)
			return error(403, 'forbidden', 'You aren’t permitted to perform this request.');
		if (auth !== `Bearer ${API_KEY}`)
			return error(
				403,
				'authentication_malformed',
				'Authentication header included, but incorrectly formatted.',
			);
		if (req.headers['paddle-version'] !== '1')
			return error(400, 'bad_request', 'Paddle-Version header missing');

		if (segments[0] === 'event-types') return { status: 200, body: envelope(EVENT_TYPES) };

		const [collection, recordId, action] = segments;
		const table = db[collection];
		if (!table) return error(404, 'not_found', `No route for ${url.pathname}`);
		const prefix = PREFIX[collection];

		if (!recordId) {
			if (req.method === 'GET')
				return { status: 200, body: list(table.values(), query, PAGE_CAP[collection]) };
			if (req.method === 'POST') {
				if (collection === 'customers') {
					if (body?.email === 'invalid')
						return error(400, 'invalid_field', 'Invalid request.', {
							errors: [{ field: 'email', message: 'must be a valid email address' }],
						});
					if (body?.email === 'rate@limit.example')
						return error(429, 'too_many_requests', 'Too many requests');
					if (body?.email === 'server@error.example')
						return error(500, 'internal_error', 'Something went wrong');
				}
				const record = {
					id: id(prefix, 1000 + ++counter),
					status: 'active',
					created_at: iso(0),
					...body,
				};
				if (collection === 'notification-settings') {
					record.active = true;
					record.endpoint_secret_key = `pdl_ntfset_e2e_${randomBytes(8).toString('hex')}`;
					record.subscribed_events = (body.subscribed_events ?? []).map((name) => ({
						name,
						description: '',
						group: '',
					}));
				}
				table.set(record.id, record);
				return { status: 201, body: envelope(record) };
			}
		}

		const record = table.get(recordId);
		if (!record) return error(404, 'entity_not_found', `${prefix} ${recordId} not found`);

		if (req.method === 'GET') return { status: 200, body: envelope(record) };
		if (req.method === 'PATCH') {
			Object.assign(record, body);
			return { status: 200, body: envelope(record) };
		}
		if (req.method === 'DELETE') {
			table.delete(recordId);
			return { status: 204 };
		}
		if (req.method === 'POST' && collection === 'subscriptions') {
			if (action === 'cancel') record.scheduled_change = { action: 'cancel' };
			if (action === 'pause')
				record.status = body.effective_from === 'immediately' ? 'paused' : record.status;
			if (action === 'resume') record.status = 'active';
			return { status: 200, body: envelope(record) };
		}
		return error(405, 'method_not_allowed', `${req.method} not supported`);
	};

	const server = https.createServer({ cert, key }, (req, res) => {
		const chunks = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => {
			const raw = Buffer.concat(chunks).toString();
			let body;
			try {
				body = raw ? JSON.parse(raw) : undefined;
			} catch {
				body = raw;
			}
			let result;
			try {
				result = handle(req, body);
			} catch (err) {
				result = error(500, 'mock_error', `mock-paddle crashed: ${err.stack}`);
			}
			res.statusCode = result.status;
			if (result.body === undefined) return res.end();
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify(result.body));
		});
	});

	return { server, requests, db };
}
