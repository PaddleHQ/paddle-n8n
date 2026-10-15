import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import {
	searchCustomers,
	searchDiscounts,
	searchPrices,
	searchProducts,
	searchSubscriptions,
	searchTransactions,
} from './listSearch';
import { customerDescription } from './resources/customer';
import { discountDescription } from './resources/discount';
import { priceDescription } from './resources/price';
import { productDescription } from './resources/product';
import { subscriptionDescription } from './resources/subscription';
import { transactionDescription } from './resources/transaction';
import { BASE_URL_EXPRESSION, PADDLE_HEADERS } from './shared/transport';

export class Paddle implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Paddle Billing',
		name: 'paddle',
		// The icon has its own background, so one file works on light and dark themes.
		icon: { light: 'file:../../icons/paddle.svg', dark: 'file:../../icons/paddle.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Manage customers, products, prices, discounts, subscriptions and transactions in Paddle Billing',
		defaults: {
			name: 'Paddle Billing',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'paddleBillingApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: BASE_URL_EXPRESSION,
			headers: PADDLE_HEADERS,
			// Failed responses are turned into helpful errors by throwOnPaddleError.
			ignoreHttpStatusErrors: true,
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Customer', value: 'customer' },
					{ name: 'Discount', value: 'discount' },
					{ name: 'Price', value: 'price' },
					{ name: 'Product', value: 'product' },
					{ name: 'Subscription', value: 'subscription' },
					{ name: 'Transaction', value: 'transaction' },
				],
				default: 'customer',
			},
			...customerDescription,
			...discountDescription,
			...priceDescription,
			...productDescription,
			...subscriptionDescription,
			...transactionDescription,
		],
	};

	methods = {
		listSearch: {
			searchCustomers,
			searchDiscounts,
			searchPrices,
			searchProducts,
			searchSubscriptions,
			searchTransactions,
		},
	};
}
