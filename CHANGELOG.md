# Changelog

## 0.1.0

- Paddle Billing node: Customer, Product, Price and Discount (Create, Get, Get Many, Update, Archive); Subscription (Get, Get Many, Cancel, Pause, Resume); Transaction (Create, Get, Get Many).
- Paddle Billing Trigger node: webhook trigger for any Paddle event, with automatic notification destination management and signature verification.
- Get Many operations can sort results, and Get and Get Many for products, prices, discounts, subscriptions and transactions return simplified output by default.
- Errors from Paddle name the rejected parameter, explain how to fix it and include Paddle's request ID.
- Paddle Billing API credential with Live and Sandbox environments.
