/**
 * Gotess Accounting Client
 * 
 * Interfaces with Gotess (Supabase-based) for:
 * - Authentication with SMS 2FA
 * - Transaction management
 * - Invoice matching
 */

import { getConfig } from '../../commands/config.js';

const SUPABASE_URL = "https://jysklqhrdqrqedomvwjg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5c2tscWhyZHFycWVkb212d2pnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTQ3MzExNTUsImV4cCI6MjAzMDMwNzE1NX0.eS0x3eYcPMWSm0beZQOqtu0-ENueOdb2ktOM04AjxXY";

export interface GotessTransaction {
    id: string;
    value_date: string;
    amount: number;
    currency: string;
    purpose?: string;
    counterpart_name?: string;
    transaction_status?: string;
    invoice_id?: string;
    account_id?: number;
    book_id: string;
}

export interface GotessInvoice {
    id: string;
    invoice_id?: string;
    invoice_date?: string;
    amount?: number;
    sender_name?: string;
    filename?: string;
    s3_uri?: string;
    book_id: string;
}

export interface GotessBook {
    id: string;
    name: string;
    company_name?: string;
}

export interface GotessAccount {
    finapi_account_id: number;
    account_name?: string;
    iban?: string;
    account_type?: string;
}

export interface LoginResult {
    access_token: string;
    refresh_token: string;
    user: {
        id: string;
        email: string;
        factors?: Array<{
            id: string;
            factor_type: string;
            phone?: string;
        }>;
    };
}

export interface MfaChallengeResult {
    id: string;
    type: string;
    expires_at: number;
}

export class GotessClient {
    private accessToken?: string;
    private bookId?: string;

    constructor(accessToken?: string, bookId?: string) {
        this.accessToken = accessToken;
        this.bookId = bookId;
    }

    static fromConfig(): GotessClient {
        const config = getConfig();
        const accessToken = config.gotessToken;
        const bookId = config.gotessBookId;
        return new GotessClient(accessToken, bookId);
    }

    private get headers(): Record<string, string> {
        return {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${this.accessToken || SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
        };
    }

    async login(email: string, password: string): Promise<LoginResult> {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error_description || err.msg || 'Login failed');
        }

        const data = await res.json();
        this.accessToken = data.access_token;
        return data;
    }

    async startMfaChallenge(factorId: string): Promise<MfaChallengeResult> {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/factors/${factorId}/challenge`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({}),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.msg || 'MFA challenge failed');
        }

        return res.json();
    }

    async verifyMfa(factorId: string, challengeId: string, code: string): Promise<LoginResult> {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/factors/${factorId}/verify`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ challenge_id: challengeId, code }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.msg || 'MFA verification failed');
        }

        const data = await res.json();
        this.accessToken = data.access_token;
        return data;
    }

    async listBooks(): Promise<GotessBook[]> {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/Books?select=id,name,company_name`, {
            headers: this.headers,
        });
        if (!res.ok) throw new Error('Failed to fetch books');
        return res.json();
    }

    async listAccounts(): Promise<GotessAccount[]> {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/FinapiAccounts?select=finapi_account_id,account_name,iban,account_type`, {
            headers: this.headers,
        });
        if (!res.ok) throw new Error('Failed to fetch accounts');
        return res.json();
    }

    async listTransactions(options: {
        bookId?: string;
        status?: string;
        limit?: number;
    } = {}): Promise<GotessTransaction[]> {
        const bid = options.bookId || this.bookId;
        if (!bid) throw new Error('Book ID required');

        let url = `${SUPABASE_URL}/rest/v1/Transactions?book_id=eq.${bid}&select=id,value_date,amount,currency,purpose,counterpart_name,transaction_status,invoice_id,account_id,book_id&order=value_date.desc&limit=${options.limit || 50}`;
        
        if (options.status) {
            url += `&transaction_status=eq.${options.status}`;
        }

        const res = await fetch(url, { headers: this.headers });
        if (!res.ok) throw new Error('Failed to fetch transactions');
        return res.json();
    }

    async getMissingInvoices(bookId?: string): Promise<GotessTransaction[]> {
        return this.listTransactions({ bookId, status: 'invoice_missing' });
    }

    async listInvoices(options: {
        bookId?: string;
        limit?: number;
        search?: string;
    } = {}): Promise<GotessInvoice[]> {
        const bid = options.bookId || this.bookId;
        if (!bid) throw new Error('Book ID required');

        let url = `${SUPABASE_URL}/rest/v1/Invoices?book_id=eq.${bid}&select=id,invoice_id,invoice_date,amount,sender_name,filename,s3_uri,book_id&order=invoice_date.desc&limit=${options.limit || 50}`;
        
        if (options.search) {
            url += `&or=(sender_name.ilike.*${options.search}*,filename.ilike.*${options.search}*)`;
        }

        const res = await fetch(url, { headers: this.headers });
        if (!res.ok) throw new Error('Failed to fetch invoices');
        return res.json();
    }

    async linkInvoice(transactionId: string, invoiceId: string): Promise<void> {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/Transactions?id=eq.${transactionId}`, {
            method: 'PATCH',
            headers: { ...this.headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({
                invoice_id: invoiceId,
                transaction_status: 'invoice_linked',
            }),
        });
        if (!res.ok) throw new Error('Failed to link invoice');
    }

    async markProofless(transactionId: string): Promise<void> {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/Transactions?id=eq.${transactionId}`, {
            method: 'PATCH',
            headers: { ...this.headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({
                transaction_status: 'proofless_auto',
            }),
        });
        if (!res.ok) throw new Error('Failed to mark proofless');
    }

    /**
     * Create an invoice record in Gotess
     * Used for auto-upload from invoice extraction
     */
    async createInvoice(invoice: {
        invoiceDate?: string;
        amount?: number;
        senderName: string;
        filename: string;
        gcsUri?: string;
        s3Uri?: string;
        bookId?: string;
    }): Promise<GotessInvoice> {
        const bid = invoice.bookId || this.bookId;
        if (!bid) throw new Error('Book ID required');

        const body = {
            invoice_date: invoice.invoiceDate,
            amount: invoice.amount,
            sender_name: invoice.senderName,
            filename: invoice.filename,
            s3_uri: invoice.s3Uri || invoice.gcsUri, // Use GCS URI as s3_uri field
            book_id: bid,
        };

        const res = await fetch(`${SUPABASE_URL}/rest/v1/Invoices`, {
            method: 'POST',
            headers: { ...this.headers, 'Prefer': 'return=representation' },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Failed to create invoice');
        }

        const data = await res.json();
        return Array.isArray(data) ? data[0] : data;
    }

    async autoMatch(bookId?: string): Promise<{
        matched: Array<{ transaction: GotessTransaction; invoice: GotessInvoice }>;
        unmatched: GotessTransaction[];
    }> {
        const bid = bookId || this.bookId;
        if (!bid) throw new Error('Book ID required');

        const [missing, invoices] = await Promise.all([
            this.getMissingInvoices(bid),
            this.listInvoices({ bookId: bid, limit: 200 }),
        ]);

        const matched: Array<{ transaction: GotessTransaction; invoice: GotessInvoice }> = [];
        const unmatched: GotessTransaction[] = [];

        for (const tx of missing) {
            const invoice = this.findMatchingInvoice(tx, invoices);
            if (invoice) {
                matched.push({ transaction: tx, invoice });
            } else {
                unmatched.push(tx);
            }
        }

        return { matched, unmatched };
    }

    private findMatchingInvoice(tx: GotessTransaction, invoices: GotessInvoice[]): GotessInvoice | null {
        const txAmount = Math.abs(tx.amount);
        const txDate = new Date(tx.value_date);
        const txName = (tx.counterpart_name || '').toLowerCase();

        for (const inv of invoices) {
            if (!inv.amount) continue;

            const amountMatch = Math.abs(inv.amount - txAmount) < 0.02;
            if (!amountMatch) continue;

            if (inv.invoice_date) {
                const invDate = new Date(inv.invoice_date);
                const daysDiff = Math.abs((txDate.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysDiff > 14) continue;
            }

            const invName = (inv.sender_name || inv.filename || '').toLowerCase();
            if (txName && invName) {
                const txWords = txName.split(/\s+/).filter(w => w.length > 3);
                const nameMatch = txWords.some(word => invName.includes(word));
                if (nameMatch) return inv;
            }

            if (amountMatch) return inv;
        }

        return null;
    }

    setAccessToken(token: string): void {
        this.accessToken = token;
    }

    setBookId(id: string): void {
        this.bookId = id;
    }

    getAccessToken(): string | undefined {
        return this.accessToken;
    }

    getBookId(): string | undefined {
        return this.bookId;
    }

    /**
     * Upload a PDF file to Supabase Storage and create invoice record
     * This uploads directly to Gotess's storage system
     */
    async uploadInvoicePdf(
        filePath: string,
        options: {
            invoiceDate?: string;
            amount?: number;
            senderName: string;
            bookId?: string;
        }
    ): Promise<GotessInvoice> {
        const bid = options.bookId || this.bookId;
        if (!bid) throw new Error('Book ID required');

        // Read file
        const fs = await import('fs');
        const path = await import('path');

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const fileBuffer = fs.readFileSync(filePath);
        const filename = path.basename(filePath);

        // Generate unique storage path
        const timestamp = Date.now();
        const storagePath = `invoices/${bid}/${timestamp}-${filename}`;

        // Upload to Supabase Storage
        const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/invoices/${storagePath}`, {
            method: 'POST',
            headers: {
                ...this.headers,
                'Content-Type': 'application/pdf',
            },
            body: fileBuffer,
        });

        if (!uploadRes.ok) {
            const err = await uploadRes.json().catch(() => ({}));
            throw new Error(err.message || `Upload failed: ${uploadRes.status}`);
        }

        // Get the public URL
        const s3Uri = `${SUPABASE_URL}/storage/v1/object/public/invoices/${storagePath}`;

        // Create invoice record
        const invoice = await this.createInvoice({
            invoiceDate: options.invoiceDate,
            amount: options.amount,
            senderName: options.senderName,
            filename,
            s3Uri,
            bookId: bid,
        });

        return invoice;
    }

    /**
     * Get signed URL for private file access
     */
    async getSignedUrl(storagePath: string, expiresIn: number = 3600): Promise<string> {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/invoices/${storagePath}`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ expiresIn }),
        });

        if (!res.ok) {
            throw new Error('Failed to generate signed URL');
        }

        const data = await res.json();
        return `${SUPABASE_URL}/storage/v1${data.signedURL}`;
    }
}

export default GotessClient;
