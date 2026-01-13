/**
 * Skuterzone Pro Client with Playwright
 *
 * Uses real browser automation for robust scraping
 */

import { chromium, Browser, Page } from 'playwright';
import { getConfig } from '../../commands/config.js';
import * as fs from 'fs';
import {
    SkuterzoneConfig,
    SkuterzoneOrder,
    SkuterzoneOrderDetails,
    SkuterzoneProduct,
    LoginResult,
} from './skuterzone-types.js';

export class SkuterzonePlaywrightClient {
    private config: SkuterzoneConfig;
    private browser?: Browser;
    private page?: Page;

    constructor(config: SkuterzoneConfig) {
        this.config = config;
    }

    static fromConfig(): SkuterzonePlaywrightClient {
        const config = getConfig();
        const env = process.env.HUSKY_ENV || 'PROD';

        const skuterzoneConfig: SkuterzoneConfig = {
            username: process.env[`${env}_SKUTERZONE_USERNAME`] ||
                      process.env.SKUTERZONE_USERNAME ||
                      config.skuterzoneUsername || '',
            password: process.env[`${env}_SKUTERZONE_PASSWORD`] ||
                      process.env.SKUTERZONE_PASSWORD ||
                      config.skuterzonePassword || '',
            baseUrl: process.env[`${env}_SKUTERZONE_BASE_URL`] ||
                     process.env.SKUTERZONE_BASE_URL ||
                     config.skuterzoneBaseUrl ||
                     'https://skuterzonepro.com',
        };

        if (!skuterzoneConfig.username || !skuterzoneConfig.password) {
            throw new Error(
                'Missing Skuterzone credentials. Configure with:\n' +
                '  husky config set skuterzone-username <username>\n' +
                '  husky config set skuterzone-password <password>'
            );
        }

        return new SkuterzonePlaywrightClient(skuterzoneConfig);
    }

    private async ensureBrowser(): Promise<Page> {
        if (!this.browser) {
            this.browser = await chromium.launch({ headless: true });
            this.page = await this.browser.newPage();
        }
        return this.page!;
    }

    async login(): Promise<LoginResult> {
        try {
            const page = await this.ensureBrowser();

            // Navigate to login page
            await page.goto(`${this.config.baseUrl}/my-account/`);
            await page.waitForLoadState('networkidle');

            // Wait for the WooCommerce login form (use id instead of name to get visible form)
            await page.waitForSelector('input#username', { state: 'visible', timeout: 10000 });

            // Fill in login form (use IDs for the visible WooCommerce form)
            await page.fill('input#username', this.config.username);
            await page.fill('input#password', this.config.password);

            // Submit form
            await page.click('button[name="login"]');

            // Wait for navigation
            await page.waitForLoadState('networkidle');

            // Check if logged in by looking for logout link or my-account elements
            const isLoggedIn = await page.locator('body.logged-in').count() > 0;

            if (!isLoggedIn) {
                return {
                    success: false,
                    cookies: '',
                    error: 'Login failed - check credentials'
                };
            }

            // Extract cookies
            const cookies = await page.context().cookies();
            const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

            return {
                success: true,
                cookies: cookieString
            };

        } catch (error) {
            return {
                success: false,
                cookies: '',
                error: `Login error: ${(error as Error).message}`
            };
        }
    }

    async listOrders(): Promise<SkuterzoneOrder[]> {
        const page = await this.ensureBrowser();

        // Navigate to orders page
        await page.goto(`${this.config.baseUrl}/my-account/orders/`);
        await page.waitForLoadState('networkidle');

        // Check if we need to login
        const needsLogin = await page.locator('form.woocommerce-form-login').count() > 0;
        if (needsLogin) {
            await this.login();
            await page.goto(`${this.config.baseUrl}/my-account/orders/`);
            await page.waitForLoadState('networkidle');
        }

        const orders: SkuterzoneOrder[] = [];

        // Find all order rows
        const orderRows = page.locator('table.woocommerce-orders-table tr.woocommerce-orders-table__row');
        const count = await orderRows.count();

        for (let i = 0; i < count; i++) {
            const row = orderRows.nth(i);

            const orderNumberEl = row.locator('.woocommerce-orders-table__cell-order-number a');
            const orderNumber = await orderNumberEl.textContent() || '';
            const orderLink = await orderNumberEl.getAttribute('href') || '';
            const orderId = orderLink.match(/view-order\/(\d+)/)?.[1] || '';

            const date = await row.locator('.woocommerce-orders-table__cell-order-date').textContent() || '';
            const status = await row.locator('.woocommerce-orders-table__cell-order-status').textContent() || '';
            const total = await row.locator('.woocommerce-orders-table__cell-order-total').textContent() || '';

            orders.push({
                id: orderId,
                orderNumber: orderNumber.trim(),
                date: date.trim(),
                status: status.trim(),
                total: total.trim(),
                itemCount: 0,
            });
        }

        return orders;
    }

    async getOrder(orderId: string): Promise<SkuterzoneOrderDetails> {
        const page = await this.ensureBrowser();

        await page.goto(`${this.config.baseUrl}/my-account/view-order/${orderId}/`);
        await page.waitForLoadState('networkidle');

        // Check if we need to login
        const needsLogin = await page.locator('form.woocommerce-form-login').count() > 0;
        if (needsLogin) {
            await this.login();
            await page.goto(`${this.config.baseUrl}/my-account/view-order/${orderId}/`);
            await page.waitForLoadState('networkidle');
        }

        // Extract order number, date, and status from the paragraph
        const orderNumber = await page.locator('mark.order-number').textContent().catch(() => orderId) || orderId;
        const orderDate = await page.locator('mark.order-date').textContent().catch(() => '') || '';
        const orderStatus = await page.locator('mark.order-status').textContent().catch(() => '') || '';

        // Extract customer info
        let customerName = '';
        let customerAddress = '';
        let customerEmail = '';
        let customerPhone = '';

        try {
            const addressBlock = page.locator('.woocommerce-customer-details address').first();
            const addressText = await addressBlock.textContent() || '';
            const lines = addressText.split('\n').map(l => l.trim()).filter(l => l);

            // Parse address lines
            if (lines.length > 0) customerName = lines[0];
            if (lines.length > 1) customerAddress = lines.slice(1).filter(l => !l.includes('@') && !l.startsWith('+')).join(', ');

            // Extract email and phone separately
            customerEmail = await page.locator('.woocommerce-customer-details--email').first().textContent().catch(() => '') || '';
            customerPhone = await page.locator('.woocommerce-customer-details--phone').first().textContent().catch(() => '') || '';
        } catch (error) {
            // Customer details not available
        }

        // Extract line items
        const items: any[] = [];
        const itemRows = page.locator('table.woocommerce-table--order-details tbody tr.woocommerce-table__line-item');
        const itemCount = await itemRows.count();

        for (let i = 0; i < itemCount; i++) {
            const itemRow = itemRows.nth(i);
            const name = await itemRow.locator('.woocommerce-table__product-name').textContent() || '';
            const qty = await itemRow.locator('.product-quantity').textContent() || '1';
            const total = await itemRow.locator('.woocommerce-table__product-total').textContent() || '';

            items.push({
                sku: '',
                name: name.trim(),
                quantity: parseInt(qty.replace(/\D/g, ''), 10) || 1,
                price: '',
                total: total.trim(),
            });
        }

        // Look for invoice link (search for links containing "invoice" or with "Bill" text)
        const invoiceLink = await page.locator('a.print-invoice').first().getAttribute('href').catch(() => '');

        // Extract total from the table footer
        const totalText = await page.locator('table.woocommerce-table--order-details tfoot tr:last-child .woocommerce-Price-amount').textContent().catch(() => '');

        return {
            id: orderId,
            orderNumber: orderNumber?.trim() || orderId,
            date: orderDate?.trim() || '',
            status: orderStatus?.trim() || '',
            total: totalText?.trim() || '',
            itemCount: items.length,
            invoiceUrl: invoiceLink || undefined,
            customer: {
                name: customerName.trim(),
                address: customerAddress.trim(),
                city: '',
                postcode: '',
                email: customerEmail.trim(),
                phone: customerPhone.trim(),
            },
            items,
            subtotal: '',
            shipping: '',
            tax: '',
            paymentMethod: '',
        };
    }

    async downloadInvoice(orderId: string, savePath: string): Promise<boolean> {
        try {
            const order = await this.getOrder(orderId);

            if (!order.invoiceUrl) {
                return false;
            }

            const page = await this.ensureBrowser();

            // Construct full URL
            const invoiceUrl = order.invoiceUrl.startsWith('http')
                ? order.invoiceUrl
                : `${this.config.baseUrl}${order.invoiceUrl}`;

            // Set up download listener before navigating
            const downloadPromise = page.waitForEvent('download', { timeout: 30000 });

            // Navigate to invoice URL (this triggers the download)
            await page.goto(invoiceUrl, { waitUntil: 'commit' }).catch(() => {
                // Ignore navigation error since download starts immediately
            });

            // Wait for the download to start
            const download = await downloadPromise;

            // Save the downloaded file
            await download.saveAs(savePath);
            return true;

        } catch (error) {
            console.error('Invoice download error:', error);
            return false;
        }
    }

    async searchProducts(query: string): Promise<SkuterzoneProduct[]> {
        const page = await this.ensureBrowser();

        const searchUrl = `${this.config.baseUrl}/?s=${encodeURIComponent(query)}&post_type=product`;
        await page.goto(searchUrl);
        await page.waitForLoadState('networkidle');

        // Check if we need to login to see prices
        const needsLogin = await page.locator('form.woocommerce-form-login').count() > 0;
        if (needsLogin) {
            await this.login();
            await page.goto(searchUrl);
            await page.waitForLoadState('networkidle');
        }

        const products: SkuterzoneProduct[] = [];

        // Find all product items
        const productItems = page.locator('li.product, .product-item');
        const count = await productItems.count();

        for (let i = 0; i < count; i++) {
            const item = productItems.nth(i);

            const link = item.locator('a').first();
            const url = await link.getAttribute('href') || '';
            const name = await item.locator('h2, h3, .woocommerce-loop-product__title').first().textContent() || '';
            const price = await item.locator('.price').first().textContent().catch(() => undefined);
            const img = await item.locator('img').first().getAttribute('src');

            if (name && url) {
                products.push({
                    id: '',
                    name: name.trim(),
                    url,
                    price: price?.trim(),
                    imageUrl: img || undefined,
                });
            }
        }

        return products;
    }

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = undefined;
            this.page = undefined;
        }
    }
}

export default SkuterzonePlaywrightClient;
