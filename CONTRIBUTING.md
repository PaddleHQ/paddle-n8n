# Contributing

Thanks for helping improve the Paddle Billing nodes for n8n. This guide covers working on the code. For a step-by-step setup from scratch, including installing n8n in Docker, see the [local setup guide](docs/local-setup-guide.md).

## Prerequisites

- Node.js 22 or later
- [pnpm](https://pnpm.io/installation). The version is pinned in `package.json` under `packageManager`.
- Docker, to run n8n locally
- A [Paddle sandbox](https://sandbox-login.paddle.com/) account and API key

## Commands

| Command           | What it does                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`    | Install dependencies                                                                                                        |
| `pnpm build`      | Compile to `dist/` and copy icons and `.node.json` files                                                                    |
| `pnpm lint`       | Run n8n's community node lint rules, the checks used for verification. `pnpm lint:fix` fixes what it can.                   |
| `pnpm test`       | Build, then run the unit tests in `test/`                                                                                   |
| `pnpm scan`       | Build, then run the rules from n8n's community package scan on the source and the packed package                            |
| `pnpm dev:docker` | Rebuild on save and reload the nodes in a running n8n (see [Running locally with Docker](#running-locally-with-docker))     |
| `pnpm dev`        | Alternative: start a separate n8n with the nodes loaded, using n8n's CLI. It also uses port 5678, so stop Docker n8n first. |

## Reviewing the package in GitHub Actions

To check the package without releasing it, go to **Actions > Review package > Run workflow**. It runs lint, the tests and the scan, lists the files that would be published, and uploads the package as a `npm-package` artifact. After a version is on npm, enter it in **published-version** to also run n8n's full scan, including the provenance check.

## Running locally with Docker

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

## Receiving webhooks locally

Paddle has to reach your n8n from the internet to deliver events to the Paddle Billing Trigger:

1. Expose n8n with a tunnel, for example `ngrok http 5678` or `cloudflared tunnel --url http://localhost:5678`.
2. Add `WEBHOOK_URL=<public https url>` to the `n8n` service's environment, then run `docker compose up -d n8n`.
3. Activate a workflow that uses the trigger, or click **Listen for test event**.

The Paddle webhook simulator (**Developer Tools > Simulations**) is a quick way to send test events. Turn on **Include Simulated Events** in the trigger to receive them.

## Installing a packaged build

To test exactly what will be published, without the mount:

```bash
pnpm build && pnpm pack        # creates paddle-n8n-nodes-paddle-<version>.tgz
docker cp paddle-n8n-nodes-paddle-0.1.0.tgz <container>:/tmp/
docker exec -it <container> sh -c 'mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes && npm install --omit=peer /tmp/paddle-n8n-nodes-paddle-0.1.0.tgz'
docker restart <container>
```

This uses npm because it runs inside the n8n image, which ships npm. `--omit=peer` stops it installing `n8n-workflow`: n8n already provides it, and installing it again pulls in native modules that need a compiler. Remove the repo mount first, or n8n will load the nodes twice.

## Pull requests

- Run `pnpm lint`, `pnpm test` and `pnpm scan` before opening a pull request. CI runs the same checks.
- Add a line to [CHANGELOG.md](CHANGELOG.md) for changes users will notice.
- Don't change the published version or create tags in a pull request. Releases are made by the maintainers.
