# Environment Configuration

## Quick Start

1. **Fetch existing secrets from GCP:**
   ```bash
   ./fetch-secrets.sh
   ```

2. **Or manually copy from template:**
   ```bash
   cp .env.example .env
   ```

3. **Fill in your credentials** in `.env`

4. **Test your configuration:**
   ```bash
   husky config test
   ```

## Getting API Tokens

### NocoDB
1. Log in to [NocoDB](https://app.nocodb.com)
2. Go to **Account Settings** → **API Tokens**
3. Click **Create Token**
4. Copy the token to `.env` as `PROD_NOCODB_API_TOKEN`

### SeaTable
1. Open your SeaTable Base
2. Click **Advanced** → **API Token**
3. Generate a new token
4. Copy to `.env` as `PROD_SEATABLE_API_TOKEN`

### Qdrant
1. Log in to [Qdrant Cloud](https://cloud.qdrant.io)
2. Go to your cluster
3. Copy the **API URL** and **API Key**
4. Add to `.env`:
   ```
   PROD_QDRANT_URL=https://your-cluster.qdrant.io
   PROD_QDRANT_API_KEY=your-key-here
   ```

### Billbee
1. Log in to [Billbee](https://app.billbee.io)
2. Go to **Settings** → **API**
3. Create API credentials
4. Add to `.env`:
   ```
   PROD_BILLBEE_API_KEY=your-key
   PROD_BILLBEE_USERNAME=your-username
   PROD_BILLBEE_PASSWORD=your-password
   ```

### Zendesk
1. Log in to Zendesk Admin Center
2. Go to **Apps and integrations** → **APIs** → **Zendesk API**
3. Enable Token Access
4. Create a new API token
5. Add to `.env`:
   ```
   PROD_ZENDESK_SUBDOMAIN=your-subdomain
   PROD_ZENDESK_EMAIL=your-email@example.com
   PROD_ZENDESK_API_TOKEN=your-token
   ```

## Environment Modes

The Husky CLI supports two environment modes:

- **PROD** (default): Production credentials
- **SANDBOX**: Sandbox/testing credentials

Set the mode with:
```bash
export HUSKY_ENV=PROD  # or SANDBOX
```

Or in your `.env`:
```
HUSKY_ENV=PROD
```

## Security Best Practices

1. ✅ **DO:**
   - Keep `.env` in `.gitignore` (already done)
   - Use `fetch-secrets.sh` to sync from Secret Manager
   - Store production secrets in GCP Secret Manager
   - Use environment-specific prefixes (`PROD_`, `SANDBOX_`)

2. ❌ **DON'T:**
   - Commit `.env` files to git
   - Share credentials in chat/email
   - Use production credentials in development
   - Hard-code credentials in source code

## Uploading Secrets to Secret Manager

To upload a new secret:
```bash
echo -n "your-secret-value" | gcloud secrets create SECRET_NAME --data-file=-
```

To update an existing secret:
```bash
echo -n "your-new-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

## Troubleshooting

### "Missing API Token" Error
```bash
# Check which values are set:
husky config list

# Set a specific value:
husky config set nocodb-api-token <token>
```

### Priority Order
The CLI checks credentials in this order:
1. `PROD_*` or `SANDBOX_*` environment variables (based on `HUSKY_ENV`)
2. Non-prefixed environment variables (e.g., `NOCODB_API_TOKEN`)
3. Local config file (`~/.husky/config.json`)

### Testing Configuration
```bash
# Test overall config:
husky config test

# Test specific integration:
husky biz nocodb list <project> <table> --json
husky biz seatable tables --json
```
