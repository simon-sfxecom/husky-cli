/**
 * Wattiz Client with Playwright
 *
 * Uses real browser automation for PrestaShop platform
 */

import { chromium, Browser, Page } from 'playwright';
import { getConfig } from '../../commands/config.js';
import * as fs from 'fs';
import {
    WattizConfig,
    WattizOrder,
    WattizOrderDetails,
    WattizProduct,
    WattizLoginResult,
} from './wattiz-types.js';

export class WattizPlaywrightClient {
    private config: WattizConfig;
    private browser?: Browser;
    private page?: Page;
    private contextCreated: boolean = false;

    constructor(config: WattizConfig) {
        this.config = config;
    }

    static fromConfig(): WattizPlaywrightClient {
        const config = getConfig();
        const env = process.env.HUSKY_ENV || 'PROD';

        const wattizConfig: WattizConfig = {
            username: process.env[`${env}_WATTIZ_USERNAME`] ||
                      process.env.WATTIZ_USERNAME ||
                      config.wattizUsername || '',
            password: process.env[`${env}_WATTIZ_PASSWORD`] ||
                      process.env.WATTIZ_PASSWORD ||
                      config.wattizPassword || '',
            baseUrl: process.env[`${env}_WATTIZ_BASE_URL`] ||
                     process.env.WATTIZ_BASE_URL ||
                     config.wattizBaseUrl ||
                     'https://www.wattiz.fr',
            language: (process.env[`${env}_WATTIZ_LANGUAGE`] ||
                      process.env.WATTIZ_LANGUAGE ||
                      config.wattizLanguage ||
                      'gb') as 'gb' | 'fr' | 'de' | 'es',
        };

        if (!wattizConfig.username || !wattizConfig.password) {
            throw new Error(
                'Missing Wattiz credentials. Configure with:\n' +
                '  husky config set wattiz-username <username>\n' +
                '  husky config set wattiz-password <password>'
            );
        }

        return new WattizPlaywrightClient(wattizConfig);
    }

    private async ensureBrowser(): Promise<Page> {
        if (!this.browser || !this.page) {
            this.browser = await chromium.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            });

            if (!this.contextCreated) {
                const context = await this.browser.newContext({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    viewport: { width: 1920, height: 1080 },
                    locale: this.config.language === 'gb' ? 'en-GB' : 'fr-FR',
                });
                this.page = await context.newPage();
                this.contextCreated = true;
            }
        }
        return this.page!;
    }

    async login(): Promise<WattizLoginResult> {
        try {
            const page = await this.ensureBrowser();

            // Navigate to login page (PrestaShop - language-specific URLs)
            // English uses /login, French uses /connexion
            const loginPath = this.config.language === 'gb' ? 'login' : 'connexion';
            await page.goto(`${this.config.baseUrl}/${this.config.language}/${loginPath}`, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            await page.waitForLoadState('domcontentloaded').catch(() => {});

            // PrestaShop can use different field patterns - try multiple selectors
            const emailSelectors = [
                'input[name="email"]',
                'input[type="email"]',
                'input#email',
                'input[id*="email"]',
                'input[name*="email"]'
            ];

            const passwordSelectors = [
                'input[name="password"]',
                'input[type="password"]',
                'input#password',
                'input[id*="password"]'
            ];

            // Find email input
            let emailInput = null;
            for (const selector of emailSelectors) {
                const count = await page.locator(selector).count();
                if (count > 0) {
                    emailInput = selector;
                    break;
                }
            }

            if (!emailInput) {
                const html = await page.content();
                await fs.promises.writeFile('/tmp/wattiz-login-debug.html', html);
                throw new Error('Could not find email input field. Debug HTML saved to /tmp/wattiz-login-debug.html');
            }

            // Find password input
            let passwordInput = null;
            for (const selector of passwordSelectors) {
                const count = await page.locator(selector).count();
                if (count > 0) {
                    passwordInput = selector;
                    break;
                }
            }

            if (!passwordInput) {
                throw new Error('Could not find password input field');
            }

            console.log(`Using selectors: email="${emailInput}", password="${passwordInput}"`);

            // Fill in login form
            await page.fill(emailInput, this.config.username);
            await page.fill(passwordInput, this.config.password);

            // Find and click submit button
            const submitSelectors = [
                'button[type="submit"]',
                'button[name="submit"]',
                'input[type="submit"]',
                'button.btn-primary'
            ];

            let submitClicked = false;
            for (const selector of submitSelectors) {
                const count = await page.locator(selector).count();
                if (count > 0) {
                    await page.click(selector);
                    submitClicked = true;
                    break;
                }
            }

            if (!submitClicked) {
                throw new Error('Could not find submit button');
            }

            // Wait for navigation
            await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

            // Check if logged in by looking for my-account page or logged-in indicators
            const currentUrl = page.url();
            console.log('After login, current URL:', currentUrl);

            // Check for error messages first
            const errorMsg = await page.locator('.alert-danger, .error-message, .ps-alert-error').textContent().catch(() => '');
            if (errorMsg) {
                console.log('Error message on page:', errorMsg.trim());
            }

            const isLoggedIn = currentUrl.includes('/my-account') ||
                              currentUrl.includes('/mon-compte') ||
                              await page.locator('.account-link').count() > 0 ||
                              await page.locator('[data-link-action="sign-out"]').count() > 0 ||
                              await page.locator('.logout, .sign-out').count() > 0 ||
                              await page.locator('a[href*="logout"]').count() > 0;

            console.log('Is logged in:', isLoggedIn);

            if (!isLoggedIn) {
                // Save debug HTML
                const debugHtml = await page.content();
                await fs.promises.writeFile('/tmp/wattiz-after-login.html', debugHtml);
                console.log('Debug HTML saved to /tmp/wattiz-after-login.html');

                return {
                    success: false,
                    cookies: '',
                    error: `Login failed - check credentials. Current URL: ${currentUrl}`
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

    async listOrders(): Promise<WattizOrder[]> {
        const page = await this.ensureBrowser();

        // Navigate to orders page (PrestaShop order-history)
        await page.goto(`${this.config.baseUrl}/${this.config.language}/order-history`);
        await page.waitForLoadState('networkidle');

        // Check if we need to login
        const needsLogin = await page.url().includes('/login');
        if (needsLogin) {
            await this.login();
            await page.goto(`${this.config.baseUrl}/${this.config.language}/order-history`);
            await page.waitForLoadState('networkidle');
        }

        const orders: WattizOrder[] = [];

        // Find all order rows (PrestaShop structure)
        const orderRows = page.locator('table tbody tr, .order-line');
        const count = await orderRows.count();

        for (let i = 0; i < count; i++) {
            const row = orderRows.nth(i);

            // PrestaShop order structure
            const orderLinkEl = row.locator('a[href*="order-detail"]').first();
            const orderLink = await orderLinkEl.getAttribute('href').catch(() => '');

            // Extract order ID from PrestaShop controller URL
            const orderIdMatch = orderLink?.match(/id_order=(\d+)/);
            const orderId = orderIdMatch ? orderIdMatch[1] : '';

            const orderNumber = await orderLinkEl.textContent().catch(() => '') || orderId;
            const date = (await row.locator('.order-date, td:nth-child(2)').textContent().catch(() => '')) || '';
            const status = (await row.locator('.order-status, td:nth-child(4), .label').textContent().catch(() => '')) || '';
            const total = (await row.locator('.order-total, td:nth-child(3)').textContent().catch(() => '')) || '';

            if (orderId) {
                orders.push({
                    id: orderId,
                    orderNumber: orderNumber.trim(),
                    date: date.trim(),
                    status: status.trim(),
                    total: total.trim(),
                    itemCount: 0,
                });
            }
        }

        return orders;
    }

    async getOrder(orderId: string): Promise<WattizOrderDetails> {
        const page = await this.ensureBrowser();

        // PrestaShop controller-based URL
        await page.goto(`${this.config.baseUrl}/${this.config.language}/index.php?controller=order-detail&id_order=${orderId}`);
        await page.waitForLoadState('networkidle');

        // Check if we need to login
        const needsLogin = await page.url().includes('/login');
        if (needsLogin) {
            await this.login();
            await page.goto(`${this.config.baseUrl}/${this.config.language}/index.php?controller=order-detail&id_order=${orderId}`);
            await page.waitForLoadState('networkidle');
        }

        // Extract order information
        const orderNumber = (await page.locator('.order-reference, h3').first().textContent().catch(() => orderId)) || orderId;
        const orderDate = (await page.locator('.order-date, .date').first().textContent().catch(() => '')) || '';
        const orderStatus = (await page.locator('.order-status, .label').first().textContent().catch(() => '')) || '';

        // Extract customer info
        let customerName = '';
        let customerAddress = '';
        let customerEmail = '';
        let customerPhone = '';

        try {
            const addressBlock = page.locator('.address, .delivery-address').first();
            const addressText = await addressBlock.textContent() || '';
            const lines = addressText.split('\n').map(l => l.trim()).filter(l => l);

            if (lines.length > 0) customerName = lines[0];
            if (lines.length > 1) customerAddress = lines.slice(1).filter(l => !l.includes('@') && !l.startsWith('+')).join(', ');

            // Try to find email and phone
            customerEmail = await page.locator('[href^="mailto:"]').first().textContent().catch(() => '') || '';
            customerPhone = await page.locator('[href^="tel:"]').first().textContent().catch(() => '') || '';
        } catch (error) {
            // Customer details not available
        }

        // Extract line items
        const items: any[] = [];
        const itemRows = page.locator('.order-products table tbody tr, .product-line-row');
        const itemCount = await itemRows.count();

        for (let i = 0; i < itemCount; i++) {
            const itemRow = itemRows.nth(i);
            const name = await itemRow.locator('.product-name, td:first-child').textContent() || '';
            const qty = await itemRow.locator('.qty, td:nth-child(2)').textContent() || '1';
            const total = await itemRow.locator('.price, td:last-child').textContent() || '';

            items.push({
                sku: '',
                name: name.trim(),
                quantity: parseInt(qty.replace(/\D/g, ''), 10) || 1,
                price: '',
                total: total.trim(),
            });
        }

        // Look for invoice link
        const invoiceLink = await page.locator('a[href*="invoice"], a.btn-primary[href*="pdf"]').first().getAttribute('href').catch(() => '');

        // Extract total
        const totalText = await page.locator('.order-total, .total-value').last().textContent().catch(() => '');

        // Extract tracking number if available
        const trackingNumber = await page.locator('.tracking-number, [href*="track"]').first().textContent().catch(() => '');

        return {
            id: orderId,
            orderNumber: orderNumber?.trim() || orderId,
            date: orderDate?.trim() || '',
            status: orderStatus?.trim() || '',
            total: totalText?.trim() || '',
            itemCount: items.length,
            invoiceUrl: invoiceLink || undefined,
            trackingNumber: trackingNumber?.trim() || undefined,
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

    async searchProducts(query: string): Promise<WattizProduct[]> {
        const page = await this.ensureBrowser();

        const searchUrl = `${this.config.baseUrl}/${this.config.language}/search?s=${encodeURIComponent(query)}`;
        await page.goto(searchUrl);
        await page.waitForLoadState('networkidle');

        // Check if we need to login to see prices (B2B feature)
        const needsLogin = await page.url().includes('/login');
        if (needsLogin) {
            await this.login();
            await page.goto(searchUrl);
            await page.waitForLoadState('networkidle');
        }

        const products: WattizProduct[] = [];

        // Find all product items (PrestaShop structure)
        const productItems = page.locator('.product-miniature, .js-product-miniature, article.product');
        const count = await productItems.count();

        for (let i = 0; i < count; i++) {
            const item = productItems.nth(i);

            const link = item.locator('a.product-thumbnail, h3 a').first();
            const url = await link.getAttribute('href') || '';
            const name = await item.locator('.product-title, h3 a, h2 a').first().textContent() || '';
            const price = await item.locator('.price, .product-price-and-shipping').first().textContent().catch(() => undefined);
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

export default WattizPlaywrightClient;
