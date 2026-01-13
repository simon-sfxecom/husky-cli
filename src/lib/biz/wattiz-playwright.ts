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
    WattizLineItem,
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

            const isLoggedIn = currentUrl.includes('/my-account') ||
                              currentUrl.includes('/mon-compte') ||
                              await page.locator('.account-link').count() > 0 ||
                              await page.locator('[data-link-action="sign-out"]').count() > 0 ||
                              await page.locator('.logout, .sign-out').count() > 0 ||
                              await page.locator('a[href*="logout"]').count() > 0;

            if (!isLoggedIn) {
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

            // PrestaShop order structure - get link for order ID
            const orderLinkEl = row.locator('a[href*="order-detail"]').first();
            const orderLink = await orderLinkEl.getAttribute('href').catch(() => '');

            // Extract order ID from PrestaShop controller URL
            const orderIdMatch = orderLink?.match(/id_order=(\d+)/);
            const orderId = orderIdMatch ? orderIdMatch[1] : '';

            // Get all table cells
            const cells = row.locator('td');
            const cellCount = await cells.count();

            // Wattiz order-history table structure (customized PrestaShop):
            // Col 0: Date, Col 1: Total, Col 2: ?, Col 3: ?, Col 4: Status, Col 5: Actions
            // Order reference is in the link or we use order ID
            let orderNumber = orderId;
            let date = '';
            let total = '';
            let status = '';

            if (cellCount >= 2) {
                // First cell contains Date
                date = (await cells.nth(0).textContent().catch(() => '')) || '';
                // Second cell contains Total
                total = (await cells.nth(1).textContent().catch(() => '')) || '';
            }
            if (cellCount >= 5) {
                // Status is in column 5 (index 4)
                status = (await cells.nth(4).textContent().catch(() => '')) || '';
            }

            // Try to find actual order reference in row text
            const rowText = await row.textContent().catch(() => '') || '';
            const refMatch = rowText.match(/WATTIZ[A-Z0-9]+|[A-Z]{2,}[0-9]{6,}/i);
            if (refMatch) {
                orderNumber = refMatch[0];
            }

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
        await page.goto(`${this.config.baseUrl}/${this.config.language}/index.php?controller=order-detail&id_order=${orderId}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        await page.waitForLoadState('domcontentloaded').catch(() => {});

        // Check if we need to login
        const needsLogin = page.url().includes('/login');
        if (needsLogin) {
            await this.login();
            await page.goto(`${this.config.baseUrl}/${this.config.language}/index.php?controller=order-detail&id_order=${orderId}`, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            await page.waitForLoadState('domcontentloaded').catch(() => {});
        }

        // Extract order information from Wattiz order detail page
        // Use order ID as the order number (Wattiz doesn't display a separate reference)
        const orderNumber = orderId;
        let orderDate = '';
        let orderStatus = '';

        // Get visible page text for pattern matching
        const pageText = await page.locator('body').textContent().catch(() => '') || '';

        // Find date - look for format DD/MM/YYYY or YYYY-MM-DD
        const dateMatches = pageText.match(/\b(\d{2}[\/\-]\d{2}[\/\-]20\d{2}|20\d{2}[\/\-]\d{2}[\/\-]\d{2})\b/g);
        if (dateMatches && dateMatches.length > 0 && dateMatches[0]) {
            orderDate = dateMatches[0];
        }

        // Get status - look for common shipping status text
        const statusPatterns = ['Shipped', 'Delivered', 'Processing', 'Pending', 'Cancelled', 'En cours', 'Expédié', 'Livré'];
        for (const pattern of statusPatterns) {
            if (pageText.includes(pattern)) {
                orderStatus = pattern;
                break;
            }
        }

        // Also try status elements if no pattern found
        if (!orderStatus) {
            const statusSelectors = ['.label.bright', '.badge', '.order-status'];
            for (const selector of statusSelectors) {
                const statusText = await page.locator(selector).first().textContent().catch(() => '');
                if (statusText && statusText.length > 2 && statusText.length < 25 && !statusText.includes('€')) {
                    orderStatus = statusText.trim();
                    break;
                }
            }
        }

        // Extract customer info from address blocks
        let customerName = '';
        let customerAddress = '';
        let customerEmail = '';
        let customerPhone = '';

        try {
            // PrestaShop uses .address class for address blocks
            const addressBlocks = page.locator('.address, article.address');
            const blockCount = await addressBlocks.count();

            for (let i = 0; i < blockCount; i++) {
                const block = addressBlocks.nth(i);
                const addressText = await block.textContent() || '';
                const lines = addressText.split('\n').map(l => l.trim()).filter(l => l && l.length > 1);

                // First line is usually the name
                if (lines.length > 0 && !customerName) {
                    customerName = lines[0];
                }
                // Combine address lines (skip name, email, phone)
                if (lines.length > 1 && !customerAddress) {
                    customerAddress = lines.slice(1)
                        .filter(l => !l.includes('@') && !l.match(/^\+?\d[\d\s\-]+$/))
                        .join(', ');
                }
            }

            // Try to find customer email (exclude wattiz domain)
            const mailLinks = await page.locator('[href^="mailto:"]').all();
            for (const link of mailLinks) {
                const href = await link.getAttribute('href').catch(() => '') || '';
                const email = href.replace('mailto:', '');
                if (email && !email.includes('wattiz')) {
                    customerEmail = email;
                    break;
                }
            }

            // Fallback: look for email pattern in address blocks (exclude wattiz)
            if (!customerEmail) {
                for (let i = 0; i < blockCount; i++) {
                    const blockText = await addressBlocks.nth(i).textContent().catch(() => '') || '';
                    const emailMatch = blockText.match(/[\w.+-]+@[\w.-]+\.\w+/);
                    if (emailMatch && !emailMatch[0].includes('wattiz')) {
                        customerEmail = emailMatch[0];
                        break;
                    }
                }
            }

            customerPhone = await page.locator('[href^="tel:"]').first().textContent().catch(() => '') || '';
        } catch (error) {
            // Customer details not available
        }

        // Extract line items from product table
        // Look for the products section specifically
        const items: WattizLineItem[] = [];

        // Try different selectors for the product table
        const productSelectors = [
            '#order-products table tbody tr',
            '.order-products tbody tr',
            '[id*="product"] table tbody tr',
            'table.table-striped tbody tr'
        ];

        let productRows = null;
        for (const selector of productSelectors) {
            const rows = page.locator(selector);
            const count = await rows.count();
            if (count > 0) {
                // Check if first row looks like a product (not a date or header)
                const firstRowText = await rows.first().textContent().catch(() => '') || '';
                if (!firstRowText.match(/^\d{4}[\/\-]\d{2}/) && firstRowText.length > 10) {
                    productRows = rows;
                    break;
                }
            }
        }

        if (productRows) {
            const itemCount = await productRows.count();

            for (let i = 0; i < itemCount; i++) {
                const itemRow = productRows.nth(i);
                const rowText = await itemRow.textContent() || '';

                // Skip rows that look like dates or headers
                if (rowText.match(/^\s*\d{4}[\/\-]\d{2}/) || rowText.includes('Product') || rowText.trim().length < 5) {
                    continue;
                }

                const cells = itemRow.locator('td');
                const cellCount = await cells.count();

                if (cellCount >= 2) {
                    const nameCell = await cells.nth(0).textContent() || '';
                    const name = nameCell.replace(/\s+/g, ' ').trim();

                    let qty = '1';
                    let total = '';

                    // Find quantity and price cells
                    for (let c = 1; c < cellCount; c++) {
                        const cellText = (await cells.nth(c).textContent() || '').trim();
                        if (cellText.match(/^\d+$/) && parseInt(cellText, 10) < 1000) {
                            qty = cellText;
                        } else if (cellText.includes('€') || cellText.includes('$')) {
                            total = cellText;
                        }
                    }

                    // Only add if name looks like a product
                    if (name && name.length > 5 && !name.match(/^\d{4}[\/\-]/)) {
                        items.push({
                            sku: '',
                            name: name,
                            quantity: parseInt(qty, 10) || 1,
                            price: '',
                            total: total,
                        });
                    }
                }
            }
        }

        // Look for invoice link
        const invoiceLink = await page.locator('a[href*="pdf-invoice"], a[href*="get-invoice"], a[href*="invoice"]').first().getAttribute('href').catch(() => '');

        // Extract total - look for price patterns in page
        let totalText = '';

        // Look for total amount in page text
        const priceMatches = pageText.match(/€\s*[\d,]+\.?\d*/g) || [];
        if (priceMatches.length > 0) {
            // Get the largest price as total (usually the order total)
            let maxPrice = 0;
            let maxPriceText = '';
            for (const priceText of priceMatches) {
                const value = parseFloat(priceText.replace('€', '').replace(/\s/g, '').replace(',', '.'));
                if (value > maxPrice) {
                    maxPrice = value;
                    maxPriceText = priceText.trim();
                }
            }
            if (maxPriceText) {
                totalText = maxPriceText;
            }
        }

        // Fallback: try specific selectors
        if (!totalText) {
            const totalSelectors = [
                '.order-totals tr:last-child td:last-child',
                '.total-value',
                'table tfoot td:last-child'
            ];
            for (const selector of totalSelectors) {
                const text = await page.locator(selector).last().textContent().catch(() => '');
                if (text && text.includes('€')) {
                    totalText = text.trim();
                    break;
                }
            }
        }

        // Extract tracking number if available
        const trackingNumber = await page.locator('.tracking-number, [href*="track"], [data-tracking]').first().textContent().catch(() => '');

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
