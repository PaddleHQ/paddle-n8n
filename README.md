# @paddle/n8n-nodes-paddle

[![CI](https://img.shields.io/github/actions/workflow/status/PaddleHQ/paddle-n8n/ci.yml?branch=main)](https://github.com/PaddleHQ/paddle-n8n/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40paddle%2Fn8n-nodes-paddle)](https://www.npmjs.com/package/@paddle/n8n-nodes-paddle)
[![npm downloads](https://img.shields.io/npm/dm/%40paddle%2Fn8n-nodes-paddle)](https://www.npmjs.com/package/@paddle/n8n-nodes-paddle)
[![License](https://img.shields.io/github/license/PaddleHQ/paddle-n8n)](LICENSE)

[Paddle Billing](https://developer.paddle.com/?utm_source=dx&utm_medium=paddle-n8n) is the developer-first merchant of record, designed for modern SaaS, AI, mobile app, and digital product businesses. We take care of payments, tax, subscriptions, and metrics with one unified API that does it all.

This package contains the official Paddle Billing nodes for [n8n](https://n8n.io/). Manage customers, your catalog, subscriptions and transactions, and start workflows when things happen in Paddle.

> This package supports **Paddle Billing** only. The Paddle node built into n8n targets Paddle Classic, which uses vendor ID and auth code credentials and isn't compatible.

[Installation](#installation) · [Credentials](#credentials) · [Nodes](#nodes) · [Examples](#examples) · [Limitations](#limitations) · [Compatibility](#compatibility) · [Support](#support)

## Installation

### From the n8n editor

On n8n Cloud and self-hosted n8n:

1. In n8n, open the nodes panel and search for **Paddle Billing**.
2. Select the node and click **Install**.

On self-hosted n8n, an instance owner can also install it by name: go to **Settings > Community Nodes > Install**, enter `@paddle/n8n-nodes-paddle`, and confirm.

### Self-hosted, from the command line

In n8n's custom nodes folder, usually `~/.n8n/nodes`:

```bash
npm install @paddle/n8n-nodes-paddle
```

Then restart n8n. See n8n's [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for details, including queue mode.

## Credentials

The nodes connect with a Paddle API key.

1. In Paddle, go to **Developer Tools > Authentication** and create an API key. See Paddle's [authentication guide](https://developer.paddle.com/api-reference/about/authentication?utm_source=dx&utm_medium=paddle-n8n).
2. Give the key permissions for what you plan to use:

   | Permission            | Access         | Needed for              |
   | --------------------- | -------------- | ----------------------- |
   | Customers             | Read and write | Customer operations     |
   | Products              | Read and write | Product operations      |
   | Prices                | Read and write | Price operations        |
   | Discounts             | Read and write | Discount operations     |
   | Subscriptions         | Read and write | Subscription operations |
   | Transactions          | Read and write | Transaction operations  |
   | Notification settings | Read and write | Paddle Billing Trigger  |

   Read access is enough for **Get** and **Get Many**. Give the key only what your workflows need. Checking the credential uses an endpoint that needs no permissions, so it works with any valid key.

3. In n8n, create a **Paddle Billing API** credential. Paste the key and choose the environment it was created in: **Live** or **Sandbox**. n8n checks the key when you save.

API keys only work in their own environment. If you use both, create a credential for each.

## Nodes

### Paddle Billing

| Resource     | Operations                             |
| ------------ | -------------------------------------- |
| Customer     | Create, Get, Get Many, Update, Archive |
| Product      | Create, Get, Get Many, Update, Archive |
| Price        | Create, Get, Get Many, Update, Archive |
| Discount     | Create, Get, Get Many, Update, Archive |
| Subscription | Get, Get Many, Cancel, Pause, Resume   |
| Transaction  | Create, Get, Get Many                  |

**Working with records**

- **ID fields** let you pick a record from a searchable list or paste a Paddle ID, such as `ctm_01h04vsc0qhwtsbsxh3422wjs4`.
- **Archive** sets the record's status to `archived`. Paddle doesn't delete records, and you can make one active again with **Update**.
- **Amounts** use the lowest denomination of the currency, as in the Paddle API. For example, `1000` is 10.00 USD.
- **Custom Data** takes a JSON object and replaces any custom data already on the record.

**Getting records**

- **Get Many** supports Paddle's filters, such as status or IDs, plus **Return All** or a **Limit**.
- **Sort** orders Get Many results by ID or, where Paddle supports it, by another field such as name or creation date. Without it, Paddle returns the newest records first.
- **Simplify** is on by default for products, prices, discounts, subscriptions and transactions. It returns up to 10 key fields with nested values flattened, for example `amount` and `currency_code` instead of `unit_price`, plus any related data you chose in **Include**. Turn it off to get Paddle's full response.

**Subscriptions**

- **Cancel** and **Pause** take effect immediately or at the end of the billing period. Pause can resume automatically on a date.
- **Resume** resumes immediately or on a date. **On Resume** chooses whether to keep the existing billing dates or start a new billing period.

**Creating records:** the main required fields are **Email** for customers, **Name** and **Tax Category** for products, the product, **Description**, **Unit Price Amount** and **Currency** for prices, **Description**, **Type** and **Amount** for discounts, and **Items** for transactions. Manually collected transactions also need **Billing Details**, with payment terms such as 14 days.

**Errors** name the parameter Paddle rejected and say how to fix it. They include Paddle's request ID, which Paddle support can use to find the request.

**AI agents** can use the node as a tool.

### Paddle Billing Trigger

Starts a workflow when the Paddle events you pick occur, for example `subscription.created` or `transaction.completed`. Choose `*` to receive every event type Paddle offers when the workflow is activated. To pick up event types Paddle adds later, deactivate and reactivate the workflow.

- Activating the workflow creates a Paddle [notification destination](https://developer.paddle.com/webhooks/overview?utm_source=dx&utm_medium=paddle-n8n) for the workflow's webhook URL. Deactivating it deletes the destination.
- Every request is checked against its `Paddle-Signature` header. Requests with a missing, invalid or stale (older than 5 minutes) signature are rejected with `401`.
- Turn on **Include Simulated Events** to receive events from Paddle's webhook simulator (**Developer Tools > Simulations**).
- The output is the full notification payload: `event_id`, `event_type`, `occurred_at`, `notification_id` and `data`.

Paddle must be able to reach your n8n webhook URL over the public internet. n8n Cloud works as is. For a local n8n, see [Receiving webhooks locally](CONTRIBUTING.md#receiving-webhooks-locally).

## Examples

### Post cancellations to Slack

1. Add a **Paddle Billing Trigger** and pick the `subscription.canceled` event.
2. Add a **Slack** node (**Send Message**) with a message such as:
   `Subscription {{ $json.data.id }} for customer {{ $json.data.customer_id }} was canceled.`
3. Activate the workflow. Each cancellation in Paddle now posts to your channel.

### Weekly report of past-due subscriptions

1. Add a **Schedule Trigger** set to run every Monday.
2. Add a **Paddle Billing** node: **Subscription > Get Many**, turn on **Return All**, and under **Filters** set **Status** to `Past Due`.
3. Add a **Google Sheets** node (**Append Row**) or an email node to share the list. With **Simplify** on, each item has flat fields such as `id`, `customer_id`, `next_billed_at` and `price_ids`.

### Create Paddle customers from sign-ups

1. Start with the trigger for your sign-up source, for example a **Form Trigger** or your CRM's trigger.
2. Add a **Paddle Billing** node: **Customer > Create**. Set **Email** to `{{ $json.email }}`, and under **Additional Fields** set **Name** and any **Custom Data**, such as your internal user ID.
3. Paddle rejects duplicate emails. To skip existing customers, first run **Customer > Get Many** with the **Email** filter and use an **If** node to create only when nothing is returned.

### Let an AI agent look up billing data

1. Add an **AI Agent** node with a chat model.
2. Under **Tools**, add **Paddle Billing** and choose read-only operations, such as **Subscription > Get** and **Transaction > Get Many**.
3. Use an API key with read-only permissions, so the agent can answer questions such as "When is this customer's next renewal?" but can't change anything.

## Limitations

- **Resources:** the node covers customers, products, prices, discounts, subscriptions and transactions. For anything else in the [Paddle API](https://developer.paddle.com/api-reference/overview?utm_source=dx&utm_medium=paddle-n8n), such as adjustments or reports, use n8n's **HTTP Request** node with the **Paddle Billing API** credential.
- **Rate limits:** Paddle allows 240 requests per minute from each IP address. **Return All** waits and retries when it hits the limit. For other operations, turn on **Retry On Fail** in the node's settings, or process items in batches with **Loop Over Items** and a **Wait** node. On n8n Cloud, other workflows sharing the same outgoing IP address count towards the same limit.
- **Webhooks:** the trigger needs a public URL. Each active trigger workflow has its own notification destination in Paddle.

## Compatibility

- Built and tested with n8n 2.41.3. It should work with any n8n 2.x release.
- Uses Paddle API version 1 (`Paddle-Version: 1`).

## Support

- **Bugs and feature requests:** [open an issue](https://github.com/PaddleHQ/paddle-n8n/issues) on GitHub.
- **Questions about your Paddle account or a failed request:** contact [Paddle support](https://www.paddle.com/help?utm_source=dx&utm_medium=paddle-n8n). Include the Paddle request ID from the error message.
- **Questions about n8n itself:** see the [n8n community forum](https://community.n8n.io/).

## Version history

See [CHANGELOG.md](CHANGELOG.md).

## Contributing

To work on the nodes locally, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Resources

- [Paddle API reference](https://developer.paddle.com/api-reference/overview?utm_source=dx&utm_medium=paddle-n8n)
- [Paddle webhooks](https://developer.paddle.com/webhooks/overview?utm_source=dx&utm_medium=paddle-n8n)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE)
