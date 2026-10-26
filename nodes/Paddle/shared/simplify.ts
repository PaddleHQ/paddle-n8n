import type { IDataObject } from 'n8n-workflow';

// Simplified outputs for the "Simplify" option: at most 10 of the most useful fields
// per record, with nested values flattened, plus any related data the user asked to include.

type Nested = IDataObject | null | undefined;

const nested = (record: IDataObject, key: string) => (record[key] ?? null) as Nested;

// Related data is only present when the user chose it in Include, so it must survive.
const included = (record: IDataObject, keys: string[]): IDataObject =>
	Object.fromEntries(
		keys.filter((key) => record[key] !== undefined).map((key) => [key, record[key]]),
	);

export const SUBSCRIPTION_INCLUDES = ['next_transaction', 'recurring_transaction_details'];

export const TRANSACTION_INCLUDES = [
	'address',
	'adjustments',
	'adjustments_totals',
	'available_payment_methods',
	'business',
	'customer',
	'discount',
];

export function simplifyProduct(product: IDataObject): IDataObject {
	return {
		id: product.id,
		name: product.name,
		description: product.description,
		type: product.type,
		tax_category: product.tax_category,
		image_url: product.image_url,
		custom_data: product.custom_data,
		status: product.status,
		created_at: product.created_at,
		updated_at: product.updated_at,
		...(product.prices !== undefined
			? { prices: (product.prices as IDataObject[]).map(simplifyPrice) }
			: {}),
	};
}

export function simplifyPrice(price: IDataObject): IDataObject {
	const unitPrice = nested(price, 'unit_price');
	const billingCycle = nested(price, 'billing_cycle');
	return {
		id: price.id,
		product_id: price.product_id,
		name: price.name,
		description: price.description,
		status: price.status,
		amount: unitPrice?.amount ?? null,
		currency_code: unitPrice?.currency_code ?? null,
		billing_interval: billingCycle?.interval ?? null,
		billing_frequency: billingCycle?.frequency ?? null,
		created_at: price.created_at,
	};
}

export function simplifyDiscount(discount: IDataObject): IDataObject {
	return {
		id: discount.id,
		code: discount.code,
		description: discount.description,
		status: discount.status,
		type: discount.type,
		amount: discount.amount,
		currency_code: discount.currency_code,
		recur: discount.recur,
		times_used: discount.times_used,
		expires_at: discount.expires_at,
	};
}

export function simplifySubscription(subscription: IDataObject): IDataObject {
	const billingCycle = nested(subscription, 'billing_cycle');
	const items = (subscription.items ?? []) as Array<{ price?: { id?: string } }>;
	return {
		id: subscription.id,
		status: subscription.status,
		customer_id: subscription.customer_id,
		currency_code: subscription.currency_code,
		collection_mode: subscription.collection_mode,
		billing_interval: billingCycle?.interval ?? null,
		billing_frequency: billingCycle?.frequency ?? null,
		next_billed_at: subscription.next_billed_at,
		scheduled_change: nested(subscription, 'scheduled_change')?.action ?? null,
		price_ids: items.map((item) => item.price?.id).filter(Boolean),
		...included(subscription, SUBSCRIPTION_INCLUDES),
	};
}

export function simplifyTransaction(transaction: IDataObject): IDataObject {
	const totals = (nested(transaction, 'details')?.totals ?? null) as Nested;
	return {
		id: transaction.id,
		status: transaction.status,
		customer_id: transaction.customer_id,
		subscription_id: transaction.subscription_id,
		invoice_number: transaction.invoice_number,
		currency_code: transaction.currency_code,
		total: totals?.grand_total ?? null,
		origin: transaction.origin,
		billed_at: transaction.billed_at,
		created_at: transaction.created_at,
		...included(transaction, TRANSACTION_INCLUDES),
	};
}
