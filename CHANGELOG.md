# Changelog

## 0.1.0

- Paddle Billing node: Customer, Product, Price and Discount (Create, Get, Get Many, Update, Archive); Subscription (Get, Get Many, Cancel, Pause, Resume); Transaction (Create, Get, Get Many).
- Paddle Billing Trigger node: webhook trigger for any Paddle event, with automatic notification destination management and signature verification.
- Get Many operations can sort results, and Get and Get Many for products, prices, discounts, subscriptions and transactions return simplified output by default.
- Transaction Create supports Billing Details for manually collected transactions.
- Return All waits and retries when Paddle rate limits a request, keeping the pages already fetched.
- The trigger fetches the webhook secret again if a signature check fails, in case it was rotated in Paddle.
- Errors from Paddle name the rejected parameter, explain how to fix it and include Paddle's request ID.
- Paddle Billing API credential with Live and Sandbox environments.
