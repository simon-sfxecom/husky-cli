# Invoice Reconciliation System - Comprehensive Plan

## Overview

Automated system for the accounting agent to identify and fetch missing invoices at month-end, reducing manual work and ensuring complete documentation for all transactions.

## Current State

### Existing Components

| Component | Status | Location |
|-----------|--------|----------|
| Gotess Client | Working | `src/lib/biz/gotess.ts` |
| GCS Upload Client | Working | `src/lib/biz/gcs-upload.ts` |
| Invoice Extractor Registry | Working | `src/lib/biz/invoice-extractor-registry.ts` |
| Wattiz Extractor | Working | `src/lib/biz/wattiz-client.ts` |
| Skuterzone Extractor | Working | `src/lib/biz/skuterzone-client.ts` |
| Emove Extractor | Working | `src/lib/biz/emove-client.ts` |

### CLI Commands Available

```bash
# Gotess (Accounting)
husky biz gotess login              # Login with 2FA
husky biz gotess missing            # List transactions missing invoices
husky biz gotess transactions       # List all transactions
husky biz gotess invoices           # List uploaded invoices
husky biz gotess match              # Auto-match invoices to transactions
husky biz gotess link <tx> <inv>    # Manually link invoice
husky biz gotess upload <file>      # Upload invoice PDF to Gotess

# Invoice Extraction
husky biz invoices sources          # List invoice sources
husky biz invoices extract <source> # Extract from specific source
husky biz invoices extract --all    # Extract from all sources
husky biz invoices reconcile        # Full reconciliation workflow
husky biz invoices test <source>    # Test credentials
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Invoice Reconciliation                        │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  1. Check Gotess for Missing Invoices                               │
│     husky biz gotess missing                                        │
│     Returns: transactions with status = "invoice_missing"           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. Map Vendors to Sources                                          │
│     "wattiz" → wattiz extractor                                     │
│     "skuterzone" → skuterzone extractor                             │
│     "emove distribution" → emove extractor                          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. Extract Invoices (Playwright)                                   │
│     - Login to supplier portal                                      │
│     - Navigate to order history                                     │
│     - Download invoice PDFs                                         │
│     - Save to local disk                                            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. Upload to GCS                                                   │
│     Bucket: gs://husky-invoices/                                    │
│     Path: partners/suppliers/{sourceId}/{invoiceId}.pdf             │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  5. Create Gotess Invoice Records                                   │
│     - Invoice date, amount, vendor                                  │
│     - GCS URI reference                                             │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  6. Auto-Match & Link                                               │
│     - Match by amount (±0.02 EUR)                                   │
│     - Match by date (±14 days)                                      │
│     - Match by vendor name patterns                                 │
│     - Link matched pairs automatically                              │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Storage

| Data | Location | Database |
|------|----------|----------|
| Invoice Source Registry | Firestore | `accounting` (separate DB) |
| Extraction Jobs | Firestore | `accounting` |
| Extracted Invoice Metadata | Firestore | `accounting` |
| Invoice PDFs | GCS | `gs://husky-invoices/` |
| Transaction/Invoice Records | Supabase | Gotess (external) |

### Firestore Collections (accounting DB)

```
husky_invoice_sources
├── id: string (auto)
├── name: string ("Wattiz", "Skuterzone", etc.)
├── type: "supplier_portal" | "email" | "api"
├── extractorId: string ("wattiz", "skuterzone", "emove")
├── status: "active" | "needs_credentials" | "disabled" | "error"
├── lastExtractedAt: timestamp
├── totalExtracted: number
└── pendingInvoices: number

husky_extraction_jobs
├── id: string (auto)
├── sourceId: string (ref to invoice_sources)
├── status: "pending" | "running" | "completed" | "failed"
├── startedAt: timestamp
├── completedAt: timestamp
├── invoicesExtracted: number
├── invoicesFailed: number
└── logs: array<{timestamp, level, message}>

husky_extracted_invoices
├── id: string (auto)
├── sourceId: string
├── jobId: string
├── externalId: string (order number)
├── invoiceDate: timestamp
├── amount: number
├── currency: string
├── vendorName: string
├── filename: string
├── gcsUri: string (gs://bucket/path)
├── gcsPath: string (path within bucket)
├── gotessInvoiceId: string (if uploaded)
└── extractedAt: timestamp
```

## Vendor Mapping

Current mapping in `invoices.ts`:

```typescript
const VENDOR_SOURCE_MAPPING: Record<string, string[]> = {
  wattiz: ["wattiz", "watti", "watt"],
  skuterzone: ["skuterzone", "skuter", "skuterzon"],
  emove: ["emove", "e-move", "emove distribution"],
};
```

### To Add More Suppliers

1. Create extractor in `src/lib/biz/{supplier}-client.ts`
2. Register in `src/lib/biz/invoice-extractor-registry.ts`
3. Add vendor patterns to `VENDOR_SOURCE_MAPPING`
4. Add credentials to config: `husky config set {supplier}-username/password`

## Scheduling Options

### Option 1: Crontab on VM

```bash
# Run on 1st of each month at 6 AM
0 6 1 * * /usr/local/bin/husky biz invoices reconcile --gcs >> /var/log/husky-reconcile.log 2>&1

# Run weekly on Monday at 6 AM
0 6 * * 1 /usr/local/bin/husky biz invoices reconcile --gcs >> /var/log/husky-reconcile.log 2>&1
```

### Option 2: Cloud Scheduler + Cloud Run

```bash
# Create HTTP trigger
gcloud scheduler jobs create http husky-invoice-reconcile \
  --location=europe-west1 \
  --schedule="0 6 1 * *" \
  --uri="https://husky-api-xxx.run.app/api/invoices/reconcile" \
  --http-method=POST \
  --headers="x-api-key=YOUR_API_KEY"
```

### Option 3: Accounting Agent Task

Create a recurring task in Husky dashboard that triggers the accounting agent to run reconciliation.

## Implementation Checklist

### Phase 1: Core Infrastructure (DONE)
- [x] GCS Upload Client
- [x] Separate Firestore DB for accounting
- [x] Invoice CRUD operations
- [x] Extractor registry with adapters

### Phase 2: CLI Commands (DONE)
- [x] `husky biz invoices sources`
- [x] `husky biz invoices extract`
- [x] `husky biz invoices reconcile`
- [x] `husky biz invoices schedule`

### Phase 3: Gotess Integration (DONE)
- [x] `createInvoice()` method in GotessClient
- [x] Auto-upload to Gotess after extraction
- [x] Auto-match after upload

### Phase 4: Missing Features
- [ ] API endpoint for Cloud Scheduler (`/api/invoices/reconcile`)
- [ ] Dashboard UI for invoice sources management
- [x] Gotess direct upload command (`husky biz gotess upload`)
- [ ] Email notification on reconciliation complete
- [ ] Slack/Chat notification for manual review items

### Phase 5: Additional Suppliers
- [ ] Add more supplier extractors as needed
- [ ] Email-based invoice extraction (Gmail API)
- [ ] API-based invoice fetching (for suppliers with APIs)

## Usage Examples

### Monthly Reconciliation (Manual)

```bash
# 1. Check what's missing
husky biz gotess missing

# 2. See which sources could help
husky biz invoices reconcile --dry-run

# 3. Run full reconciliation
husky biz invoices reconcile --gcs

# 4. Review any remaining unmatched
husky biz gotess missing
```

### Automated Monthly Run

```bash
# Full automated flow
husky biz invoices reconcile --gcs 2>&1 | tee /tmp/reconcile-$(date +%Y%m).log

# Check results
echo "Reconciliation complete. Results:"
tail -20 /tmp/reconcile-$(date +%Y%m).log
```

### Test Specific Source

```bash
# Test credentials
husky biz invoices test wattiz

# Extract just from wattiz with limit
husky biz invoices extract wattiz --limit 5 --gcs
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Gotess session expired | `husky biz gotess login` |
| Source credentials invalid | `husky biz invoices test <source>` |
| GCS access denied | Check service account permissions |
| No matches found | Check vendor name patterns in mapping |

### Debug Commands

```bash
# Check Gotess status
husky biz gotess status

# Check credentials configured
husky biz invoices sources

# Check extraction status
husky biz invoices status

# Verbose extraction
husky biz invoices extract wattiz --limit 1
```

## Security Considerations

- Credentials stored in `~/.husky/config.json` (local only)
- GCS uses Application Default Credentials (ADC)
- Gotess tokens expire and need refresh
- Invoice PDFs in GCS are not public by default
- Accounting DB is separate from main Husky DB

## Future Enhancements

1. **Smart Scheduling**: Only run when transactions are pending
2. **Pattern Learning**: Improve vendor matching based on history
3. **Multi-tenant**: Support multiple books/companies
4. **PDF OCR**: Extract data from scanned invoices
5. **Duplicate Detection**: Prevent uploading same invoice twice
