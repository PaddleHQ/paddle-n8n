# @paddle/n8n-nodes-paddle

Official [Paddle Billing](https://www.paddle.com/billing) nodes for [n8n](https://n8n.io/). Manage customers, your catalog, subscriptions and transactions, and start workflows when things happen in Paddle.

> This package supports **Paddle Billing** only. The Paddle node built into n8n targets Paddle Classic, which uses vendor ID and auth code credentials and isn't compatible.

[Installation](#installation) · [Nodes](#nodes) · [Credentials](#credentials) · [Development](#development) · [Resources](#resources)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) and install `@paddle/n8n-nodes-paddle`.

## Nodes

### Paddle Billing

| Resource     | Operations                                  |
| ------------ | ------------------------------------------- |
| Customer     | Create, Get, Get Many, Update, Archive      |
| Product      | Create, Get, Get Many, Update, Archive      |
| Price        | Create, Get, Get Many, Update, Archive      |
| Discount     | Create, Get, Get Many, Update, Archive      |
| Subscription | Get, Get Many, Cancel, Pause, Resume        |
| Transaction  | Create, Get, Get Many                       |

- **Get Many** supports Paddle's filters, plus **Return All** or a **Limit**. Paging uses Paddle's cursor pagination.
- **ID fields** let you pick a record from a searchable list or paste a Paddle ID.
- **Amounts** use the lowest denomination of the currency, as in the Paddle API. For example, `1000` is 10.00 USD.
- **AI agents** can use the node as a tool.

### Paddle Billing Trigger

Starts a workflow when the Paddle events you pick occur, for example `subscription.created` or `transaction.completed`. Choose `*` to receive every event.

- Activating the workflow creates a Paddle [notification destination](https://developer.paddle.com/webhooks/overview) for the workflow's webhook URL. Deactivating it deletes the destination.
- Every request is checked against its `Paddle-Signature` header. Requests with a missing, invalid or stale (older than 5 minutes) signature are rejected with `401`.
- Turn on **Include Simulated Events** to receive events from Paddle's webhook simulator.
- The output is the full notification payload: `event_id`, `event_type`, `occurred_at`, `notification_id` and `data`.

Paddle must be able to reach your n8n webhook URL over the public internet, so a local n8n needs a tunnel. See [Testing locally](#testing-locally).

## Credentials

1. In Paddle, go to **Developer Tools > Authentication** and create an API key. Give it permissions for the resources you plan to use. The trigger needs **Notification settings** (read and write) and **Event types** (read).
2. In n8n, create a **Paddle Billing API** credential. Paste the key and choose the environment it belongs to (**Live** or **Sandbox**).

API keys only work in the environment they were created in. If you use both environments, create two credentials.

To point the nodes at another Paddle API host, such as an internal development environment, choose **Custom** and enter its **Base URL**.

## Compatibility

Built and tested against n8n 2.x.

## Development

### Prerequisites

- Node.js 22 or later
- [pnpm](https://pnpm.io/installation). The version is pinned in `package.json` under `packageManager`.
- Docker, to run n8n locally
- A [Paddle sandbox](https://sandbox-login.paddle.com/) account and API key

### Commands

| Command | What it does |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm build` | Compile to `dist/` and copy icons and `.node.json` files |
| `pnpm lint` | Run n8n's community node lint rules, the checks used for verification. `pnpm lint:fix` fixes what it can. |
| `pnpm test` | Build, then run the unit tests in `test/` |
| `pnpm dev:docker` | Rebuild on save and reload the nodes in a running n8n (see below) |
| `pnpm dev` | Alternative: start a separate n8n with the nodes loaded, using n8n's CLI. It also uses port 5678, so stop Docker n8n first. |

### Running locally with Docker

This mounts the repo straight into a Docker n8n, so code changes show up without reinstalling anything.

**1. Mount the repo in your n8n compose file (one-time setup).** Add these volumes and the environment variable to the `n8n` service:

```yaml
  n8n:
    environment:
      - N8N_DEV_RELOAD=true
    volumes:
      - n8n-data:/home/node/.n8n
      - /path/to/paddle-n8n:/home/node/.n8n/custom/node_modules/@paddle/n8n-nodes-paddle:ro
      - /home/node/.n8n/custom/node_modules/@paddle/n8n-nodes-paddle/node_modules
```

- Mount the repo root, not `dist/`. Every build recreates `dist/`, which would leave a direct mount pointing at a deleted, empty folder, and the icons would break.
- The last line is an empty volume over the repo's `node_modules`. It stops n8n loading this project's dev dependencies instead of its own.

**2. Start n8n.** From the folder that holds your compose file:

```bash
docker compose up -d n8n
```

Open http://localhost:5678. On first run, n8n asks you to create an owner account. That account only exists on your machine.

**3. Start the watcher.** From this repo:

```bash
pnpm install
pnpm dev:docker
```

Leave it running. After each successful compile it calls n8n's `POST /rest/dev/reload`. n8n's own file watching doesn't work inside the Docker image, so this does the job instead. Set `N8N_URL` if n8n isn't at `http://localhost:5678`.

**4. Make changes.** Edit and save a `.ts` file, then refresh the browser. Hard-refresh (Cmd+Shift+R) if the node list looks out of date.

- **Icons or `.node.json` files:** `tsc` doesn't copy these, so restart `pnpm dev:docker` after changing them.
- **`package.json`:** after changing the `n8n.nodes` or `n8n.credentials` lists, restart the container with `docker compose restart n8n`.

**5. Try the nodes.**

1. In n8n, go to **Credentials > Create credential > Paddle Billing API**.
2. Paste a sandbox API key and set the environment to **Sandbox**.
3. In a workflow, search for **Paddle Billing**.

### Receiving webhooks locally

Paddle has to reach your n8n from the internet to deliver events to the Paddle Billing Trigger:

1. Expose n8n with a tunnel, for example `ngrok http 5678` or `cloudflared tunnel --url http://localhost:5678`.
2. Add `WEBHOOK_URL=<public https url>` to the `n8n` service's environment, then run `docker compose up -d n8n`.
3. Activate a workflow that uses the trigger, or click **Listen for test event**.

The Paddle webhook simulator (**Developer Tools > Simulations**) is a quick way to send test events. Turn on **Include Simulated Events** in the trigger to receive them.

### Installing a packaged build

To test exactly what will be published, without the mount:

```bash
pnpm build && pnpm pack        # creates paddle-n8n-nodes-paddle-<version>.tgz
docker cp paddle-n8n-nodes-paddle-0.1.0.tgz <container>:/tmp/
docker exec -it <container> sh -c 'mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes && npm install --omit=peer /tmp/paddle-n8n-nodes-paddle-0.1.0.tgz'
docker restart <container>
```

This uses npm because it runs inside the n8n image, which ships npm. `--omit=peer` stops it installing `n8n-workflow`: n8n already provides it, and installing it again pulls in native modules that need a compiler. Remove the repo mount first, or n8n will load the nodes twice.

## Resources

- [Paddle API reference](https://developer.paddle.com/api-reference/overview)
- [Paddle webhooks](https://developer.paddle.com/webhooks/overview)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
