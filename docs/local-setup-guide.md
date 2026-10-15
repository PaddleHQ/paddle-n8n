# Paddle n8n nodes: local setup guide

This guide gets the Paddle Billing nodes for n8n running on your machine. By the end you'll have:

- n8n running locally in Docker at http://localhost:5678
- the Paddle Billing and Paddle Billing Trigger nodes loaded from your copy of the code
- changes you save in the code showing up in n8n after a browser refresh
- optionally, Paddle webhooks reaching your local n8n through a tunnel

It takes about 20 minutes the first time.

> **Note:** This is for testing and development only. Everything here runs on your machine, and the n8n account you create only exists locally.

---

## 1. Before you start

Install these first:

| Tool           | Version     | How to get it                                                                          |
| -------------- | ----------- | -------------------------------------------------------------------------------------- |
| Git            | Any recent  | Comes with Xcode Command Line Tools: `xcode-select --install`                          |
| Node.js        | 22 or later | [nodejs.org](https://nodejs.org/), or `brew install node`                              |
| pnpm           | 12.4.2      | `corepack enable`. The version is pinned in the repo, so Corepack picks the right one. |
| Docker Desktop | Any recent  | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)  |
| cloudflared    | Any recent  | Only needed for the trigger node: `brew install cloudflared`                           |

You also need:

- access to the repository: **PaddleHQ/paddle-n8n** on GitHub
- a **Paddle sandbox** account. Sign in at [sandbox-login.paddle.com](https://sandbox-login.paddle.com/).

Check everything is installed:

```bash
git --version
node --version     # v22 or later
pnpm --version     # 12.4.2
docker --version
```

---

## 2. Get the code and build it

```bash
git clone https://github.com/PaddleHQ/paddle-n8n.git
cd paddle-n8n
pnpm install
pnpm build
```

`pnpm build` compiles the nodes into the `dist/` folder. n8n loads them from there.

Note the full path to this folder, because you need it in the next step. Run `pwd` to print it, for example `/Users/your.name/paddle-n8n`.

---

## 3. Set up n8n in Docker

### 3.1 Create a folder for n8n

Keep n8n's setup outside the repo:

```bash
mkdir ~/n8n
cd ~/n8n
```

### 3.2 Create the compose file

Create `~/n8n/compose.yml` with the following. Replace `/Users/your.name/paddle-n8n` with your path from step 2.

```yaml
services:
  n8n:
    image: docker.io/n8nio/n8n:2.41.3
    ports:
      - '5678:5678'
    environment:
      # Lets the repo's watcher tell n8n to reload the nodes after each build.
      - N8N_DEV_RELOAD=true
      - GENERIC_TIMEZONE=Europe/London
      # Uncomment and set this when testing the trigger (see section 7).
      # - WEBHOOK_URL=https://your-tunnel.trycloudflare.com
    volumes:
      # n8n's data: your account, workflows and credentials.
      - n8n-data:/home/node/.n8n
      # The Paddle nodes, mounted straight from your copy of the repo.
      - /Users/your.name/paddle-n8n:/home/node/.n8n/custom/node_modules/@paddle/n8n-nodes-paddle:ro
      # Hides the repo's own node_modules so n8n uses its own libraries.
      - /home/node/.n8n/custom/node_modules/@paddle/n8n-nodes-paddle/node_modules

volumes:
  n8n-data:
```

Why it's set up this way:

- **The repo root is mounted, not `dist/`.** Each build deletes and recreates `dist/`, which would leave a direct mount pointing at an empty folder and break the icons.
- **The last volume is deliberately empty.** Without it, n8n would load the repo's development dependencies instead of its own copies, and the nodes can fail to load.
- **The version is pinned** to the one the nodes were tested with. You can try a newer version later.

### 3.3 Start n8n

```bash
cd ~/n8n
docker compose up -d
```

The first start downloads the image, which takes a minute or two. Check that it's running:

```bash
docker compose ps
docker compose logs -f n8n     # Ctrl+C to stop following the logs
```

### 3.4 Create your local n8n account

1. Open http://localhost:5678.
2. n8n asks you to set up an owner account. Enter any name, email and password.
3. Skip the questionnaire and any paid-feature prompts.

> **Note:** This account only exists in your local n8n. If you forget the password, see **Troubleshooting**.

---

## 4. Start the watcher

In a new terminal window, from the repo:

```bash
cd ~/paddle-n8n
pnpm dev:docker
```

Leave this running while you work. Each time you save a `.ts` file, it:

1. recompiles the nodes, then
2. tells n8n to reload them.

You'll see `↻ n8n reloaded nodes` after each successful build. Refresh the browser to see the change.

> **Tip:** If n8n isn't at http://localhost:5678, start the watcher with `N8N_URL=http://your-host:port pnpm dev:docker`.

Some changes need more than a refresh:

| You changed                                          | Do this                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A `.ts` file                                         | Refresh the browser. Use Cmd+Shift+R if the node list looks out of date.                         |
| An icon or a `.node.json` file                       | Stop the watcher (Ctrl+C) and run `pnpm dev:docker` again. The watcher doesn't copy these files. |
| A credential, or the `n8n` section of `package.json` | Run `pnpm build`, then `docker compose restart n8n` in `~/n8n`.                                  |

---

## 5. Create a Paddle API key

1. Sign in to the [Paddle sandbox](https://sandbox-login.paddle.com/).
2. Go to **Developer Tools > Authentication**.
3. Create an API key and give it these permissions:

| Permission            | Access         | Used by                                  |
| --------------------- | -------------- | ---------------------------------------- |
| Customers             | Read and write | Customer operations                      |
| Products              | Read and write | Product operations                       |
| Prices                | Read and write | Price operations                         |
| Discounts             | Read and write | Discount operations                      |
| Subscriptions         | Read and write | Subscription operations                  |
| Transactions          | Read and write | Transaction operations                   |
| Notification settings | Read and write | Trigger node                             |
| Event types           | Read           | Trigger node, and testing the credential |

4. Copy the key. Paddle only shows it once.

> **Note:** API keys only work in the environment they were created in. A sandbox key won't work with **Live**, and a live key won't work with **Sandbox**.

---

## 6. Connect n8n to Paddle and try the nodes

### 6.1 Create the credential

1. In n8n, go to **Overview > Credentials > Create credential**.
2. Search for **Paddle Billing API** and select it.
3. Paste your API key and set **Environment** to **Sandbox**.
4. Click **Save**. n8n tests the key straight away, and a green message means it works.

### 6.2 Run a first workflow

1. Create a workflow and add a **Manual Trigger**.
2. Add a **Paddle Billing** node and choose your credential.
3. Set **Resource** to **Customer** and **Operation** to **Get Many**, and set **Limit** to 5.
4. Click **Execute workflow**. You should see up to 5 customers from your sandbox account.

### 6.3 Things to check

| Feature                | How to test it                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **ID fields**          | On **Get**, pick a record from the list, then switch to **By ID** and paste a Paddle ID                          |
| **Simplify**           | On a Product, Price, Discount, Subscription or Transaction **Get**, turn **Simplify** off and compare the output |
| **Sort**               | On any **Get Many**, add **Sort** and change **Sort By** or **Direction**                                        |
| **Filters and paging** | On **Get Many**, add a filter, then turn on **Return All**                                                       |
| **Error messages**     | Paste an ID that doesn't exist, or use a key without a permission, and read the message and its description      |
| **AI agent tool**      | Add an **AI Agent** node and add **Paddle Billing** as a tool                                                    |

---

## 7. Test the trigger with webhooks (optional)

The **Paddle Billing Trigger** needs Paddle to reach your n8n over the internet. A quick tunnel gives your local n8n a temporary public address.

### 7.1 Start a tunnel

In a new terminal:

```bash
cloudflared tunnel --url http://localhost:5678
```

Copy the `https://….trycloudflare.com` address it prints, and leave the tunnel running.

> **Note:** The address changes every time you restart `cloudflared`. When it changes, repeat step 7.2.

### 7.2 Tell n8n its public address

1. In `~/n8n/compose.yml`, uncomment the `WEBHOOK_URL` line and set it to the tunnel address:

   ```yaml
   - WEBHOOK_URL=https://your-tunnel.trycloudflare.com
   ```

2. Apply the change:

   ```bash
   cd ~/n8n
   docker compose up -d
   ```

### 7.3 Receive an event

1. Create a workflow and add a **Paddle Billing Trigger**.
2. Choose your credential and pick an event, for example `customer.created`.
3. Open **Options** and turn on **Include Simulated Events**.
4. Click **Execute workflow**. The trigger waits for an event, and Paddle now has a notification destination pointing at your tunnel.
5. In Paddle, go to **Developer Tools > Simulations** and send a `customer.created` event to that destination. You can also create a customer in the sandbox.
6. The event appears in n8n.

When you stop testing, or deactivate the workflow, n8n deletes the notification destination in Paddle.

---

## 8. Test the packaged build (optional)

To test exactly what will be published to npm, install the packaged build instead of the mounted repo.

1. In `~/n8n/compose.yml`, comment out the two Paddle volume lines. If you don't, n8n loads the nodes twice.
2. Build and pack the nodes, then install the package in the container:

   ```bash
   cd ~/paddle-n8n
   pnpm build && pnpm pack
   docker cp paddle-n8n-nodes-paddle-0.1.0.tgz n8n-n8n-1:/tmp/
   docker exec -it n8n-n8n-1 sh -c 'mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes && npm install --omit=peer /tmp/paddle-n8n-nodes-paddle-0.1.0.tgz'
   cd ~/n8n
   docker compose up -d
   docker compose restart n8n
   ```

If your container has a different name, run `docker compose ps` to find it. `--omit=peer` stops npm installing a second copy of `n8n-workflow`, which n8n already provides.

---

## 9. Troubleshooting

| Problem                                                      | Fix                                                                                                                                                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The Paddle nodes don't appear**                            | Check that `dist/` exists (`pnpm build`), check the path in `compose.yml`, then run `docker compose restart n8n` and hard-refresh the browser                                            |
| **The nodes appear twice**                                   | Both the mounted repo and a packaged install are loaded. Remove one of them (see section 8).                                                                                             |
| **The watcher says it can't reach n8n**                      | Check n8n is running (`docker compose ps`), and that `N8N_DEV_RELOAD=true` is set in `compose.yml`                                                                                       |
| **Changes don't show up**                                    | Hard-refresh (Cmd+Shift+R). For icon, `.node.json`, credential or `package.json` changes, see the table in section 4.                                                                    |
| **The credential test fails**                                | Check the key was copied in full, and that **Environment** matches where the key was created                                                                                             |
| **"The credential doesn't have permission for this action"** | Add the missing permission to the API key in Paddle (see section 5)                                                                                                                      |
| **The trigger never receives events**                        | Check the tunnel is still running and that `WEBHOOK_URL` matches its current address. Then run `docker compose up -d` and start listening again.                                         |
| **The trigger rejects events with 401**                      | The signature check failed. Deactivate and reactivate the workflow so n8n creates a fresh notification destination.                                                                      |
| **Port 5678 is already in use**                              | Another n8n is running. Stop it, or change the port mapping to `'5679:5678'` and open http://localhost:5679.                                                                             |
| **Forgot your local n8n password**                           | Run `docker compose exec n8n n8n user-management:reset`, then `docker compose restart n8n`. Your workflows and credentials are kept, and n8n asks you to create the owner account again. |

---

## 10. Command reference

From the repo (`~/paddle-n8n`):

| Command           | What it does                                                                          |
| ----------------- | ------------------------------------------------------------------------------------- |
| `pnpm install`    | Install dependencies                                                                  |
| `pnpm build`      | Compile the nodes into `dist/`                                                        |
| `pnpm dev:docker` | Rebuild on save and reload the nodes in n8n                                           |
| `pnpm lint`       | Run n8n's community node checks, the same ones used for verification                  |
| `pnpm lint:fix`   | Fix what the linter can fix automatically                                             |
| `pnpm test`       | Build, then run the unit tests                                                        |
| `pnpm scan`       | Build, then run n8n's community package scan rules on the code and the packed package |

From the n8n folder (`~/n8n`):

| Command                      | What it does                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `docker compose up -d`       | Start n8n, or apply changes to `compose.yml`                                            |
| `docker compose restart n8n` | Restart n8n                                                                             |
| `docker compose logs -f n8n` | Follow n8n's logs                                                                       |
| `docker compose down`        | Stop n8n. Your data is kept.                                                            |
| `docker compose down -v`     | Stop n8n and **delete all its data**, including your account, workflows and credentials |
