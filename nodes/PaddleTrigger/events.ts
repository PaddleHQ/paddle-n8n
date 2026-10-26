// Paddle Billing event types, from the webhooks in https://github.com/PaddleHQ/paddle-openapi.
// A static list lets n8n show each event as its own trigger in the nodes panel.
// Events added to Paddle later are still received when "*" (all events) is selected.
import type { INodePropertyOptions } from 'n8n-workflow';

export const PADDLE_EVENTS: INodePropertyOptions[] = [
	{
		name: 'Address Created',
		value: 'address.created',
		description: 'Occurs when an address is created',
	},
	{
		name: 'Address Imported',
		value: 'address.imported',
		description: 'Occurs when an address is imported',
	},
	{
		name: 'Address Updated',
		value: 'address.updated',
		description: 'Occurs when an address is updated',
	},
	{
		name: 'Adjustment Created',
		value: 'adjustment.created',
		description: 'Occurs when an adjustment is created',
	},
	{
		name: 'Adjustment Updated',
		value: 'adjustment.updated',
		description: 'Occurs when an adjustment is updated',
	},
	{
		name: 'API Key Created',
		value: 'api_key.created',
		description: 'Occurs when an API key is created',
	},
	{
		name: 'API Key Expired',
		value: 'api_key.expired',
		description: 'Occurs when an API key has expired',
	},
	{
		name: 'API Key Expiring',
		value: 'api_key.expiring',
		description: 'Occurs when an API key expires in 7 days',
	},
	{
		name: 'API Key Exposure Created',
		value: 'api_key_exposure.created',
		description: 'Occurs when an API key has been exposed',
	},
	{
		name: 'API Key Revoked',
		value: 'api_key.revoked',
		description: 'Occurs when an API key has been revoked',
	},
	{
		name: 'API Key Updated',
		value: 'api_key.updated',
		description: 'Occurs when an API key is updated',
	},
	{
		name: 'Business Created',
		value: 'business.created',
		description: 'Occurs when a business is created',
	},
	{
		name: 'Business Imported',
		value: 'business.imported',
		description: 'Occurs when a business is imported',
	},
	{
		name: 'Business Updated',
		value: 'business.updated',
		description: 'Occurs when a business is updated',
	},
	{
		name: 'Client Token Created',
		value: 'client_token.created',
		description: 'Occurs when a client-side token is created',
	},
	{
		name: 'Client Token Revoked',
		value: 'client_token.revoked',
		description: 'Occurs when a client-side token is revoked',
	},
	{
		name: 'Client Token Updated',
		value: 'client_token.updated',
		description: 'Occurs when a client-side token is updated',
	},
	{
		name: 'Customer Created',
		value: 'customer.created',
		description: 'Occurs when a customer is created',
	},
	{
		name: 'Customer Imported',
		value: 'customer.imported',
		description: 'Occurs when a customer is imported',
	},
	{
		name: 'Customer Updated',
		value: 'customer.updated',
		description: 'Occurs when a customer is updated',
	},
	{
		name: 'Discount Created',
		value: 'discount.created',
		description: 'Occurs when a discount is created',
	},
	{
		name: 'Discount Group Created',
		value: 'discount_group.created',
		description: 'Occurs when a discount group is created',
	},
	{
		name: 'Discount Group Updated',
		value: 'discount_group.updated',
		description: 'Occurs when a discount group is updated',
	},
	{
		name: 'Discount Imported',
		value: 'discount.imported',
		description: 'Occurs when a discount is imported',
	},
	{
		name: 'Discount Updated',
		value: 'discount.updated',
		description: 'Occurs when a discount is updated',
	},
	{
		name: 'Meter Created',
		value: 'meter.created',
		description: 'Occurs when a meter is created',
	},
	{
		name: 'Meter Updated',
		value: 'meter.updated',
		description: 'Occurs when a meter is updated',
	},
	{
		name: 'Payment Method Deleted',
		value: 'payment_method.deleted',
		description: 'Occurs when a payment method is deleted',
	},
	{
		name: 'Payment Method Saved',
		value: 'payment_method.saved',
		description: 'Occurs when a payment method is saved',
	},
	{
		name: 'Payout Created',
		value: 'payout.created',
		description: 'Occurs when a payout is initiated by Paddle',
	},
	{
		name: 'Payout Paid',
		value: 'payout.paid',
		description:
			'Occurs when a payout is paid. This is usually the working day before the funds credit your account.',
	},
	{
		name: 'Price Created',
		value: 'price.created',
		description: 'Occurs when a price is created',
	},
	{
		name: 'Price Imported',
		value: 'price.imported',
		description: 'Occurs when a price is imported',
	},
	{
		name: 'Price Updated',
		value: 'price.updated',
		description: 'Occurs when a price is updated',
	},
	{
		name: 'Product Created',
		value: 'product.created',
		description: 'Occurs when a product is created',
	},
	{
		name: 'Product Imported',
		value: 'product.imported',
		description: 'Occurs when a product is imported',
	},
	{
		name: 'Product Updated',
		value: 'product.updated',
		description: 'Occurs when a product is updated',
	},
	{
		name: 'Report Created',
		value: 'report.created',
		description: 'Occurs when a report is created',
	},
	{
		name: 'Report Updated',
		value: 'report.updated',
		description: 'Occurs when a report is updated',
	},
	{
		name: 'Subscription Activated',
		value: 'subscription.activated',
		description:
			'Occurs when a subscription becomes active. Its `status` field changes to `active`.',
	},
	{
		name: 'Subscription Canceled',
		value: 'subscription.canceled',
		description:
			'Occurs when a subscription is canceled. Its `status` field changes to `canceled`.',
	},
	{
		name: 'Subscription Created',
		value: 'subscription.created',
		description:
			'Occurs when a subscription is created. Paddle automatically creates subscriptions for recurring items when automatically-collected transactions are `completed`, or when manually-collected transactions are `billed`.',
	},
	{
		name: 'Subscription Imported',
		value: 'subscription.imported',
		description: 'Occurs when a subscription is imported',
	},
	{
		name: 'Subscription Past Due',
		value: 'subscription.past_due',
		description:
			'Occurs when a subscription has an unpaid transaction. Its `status` changes to `past_due`.',
	},
	{
		name: 'Subscription Paused',
		value: 'subscription.paused',
		description: 'Occurs when a subscription is paused. Its `status` field changes to `paused`.',
	},
	{
		name: 'Subscription Resumed',
		value: 'subscription.resumed',
		description:
			'Occurs when a subscription is resumed after being paused. Its status field changes to `active`.',
	},
	{
		name: 'Subscription Trialing',
		value: 'subscription.trialing',
		description: 'Occurs when a subscription enters trial period',
	},
	{
		name: 'Subscription Updated',
		value: 'subscription.updated',
		description: 'Occurs when a subscription is updated',
	},
	{
		name: 'Transaction Billed',
		value: 'transaction.billed',
		description:
			'Occurs when a transaction is billed. Its `status` field changes to `billed` and `billed_at` is populated.',
	},
	{
		name: 'Transaction Canceled',
		value: 'transaction.canceled',
		description: 'Occurs when a transaction is canceled. Its `status` field changes to `canceled`.',
	},
	{
		name: 'Transaction Completed',
		value: 'transaction.completed',
		description: 'Occurs when a transaction is completed. Its status field changes to `completed`.',
	},
	{
		name: 'Transaction Created',
		value: 'transaction.created',
		description: 'Occurs when a transaction is created',
	},
	{
		name: 'Transaction Paid',
		value: 'transaction.paid',
		description: 'Occurs when a transaction is paid. Its status field changes to `paid`.',
	},
	{
		name: 'Transaction Past Due',
		value: 'transaction.past_due',
		description:
			'Occurs when a transaction becomes past due. Its `status` field changes to `past_due`.',
	},
	{
		name: 'Transaction Payment Failed',
		value: 'transaction.payment_failed',
		description:
			'Occurs when a payment fails for a transaction. The `payments` array is updated with details of the payment attempt.',
	},
	{
		name: 'Transaction Ready',
		value: 'transaction.ready',
		description:
			'Occurs when a transaction is ready to be billed. Its `status` field changes to `ready`.',
	},
	{
		name: 'Transaction Revised',
		value: 'transaction.revised',
		description: 'Occurs when a transaction is revised',
	},
	{
		name: 'Transaction Updated',
		value: 'transaction.updated',
		description: 'Occurs when a transaction is updated',
	},
	{
		name: 'Usage Balance Depleted',
		value: 'usage_balance.depleted',
		description: 'Occurs when a usage balance is depleted',
	},
];
