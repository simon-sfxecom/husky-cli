import { chromium } from 'playwright';

async function debugOrderDetail() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Login first
    await page.goto('https://skuterzonepro.com/my-account/');
    await page.waitForLoadState('networkidle');
    await page.fill('input#username', 'simon@sfx-ecommerce.com');
    await page.fill('input#password', 'Skutoonge01!');
    await page.click('button[name="login"]');
    await page.waitForLoadState('networkidle');

    // Go to order detail page
    await page.goto('https://skuterzonepro.com/my-account/view-order/116096/');
    await page.waitForLoadState('networkidle');

    // Take screenshot
    await page.screenshot({ path: '/tmp/skuterzone-order-detail.png', fullPage: true });

    // Save HTML
    const html = await page.content();
    await import('fs').then(fs => fs.promises.writeFile('/tmp/skuterzone-order-detail.html', html));

    console.log('✓ Screenshot saved to /tmp/skuterzone-order-detail.png');
    console.log('✓ HTML saved to /tmp/skuterzone-order-detail.html');

    // Look for order information
    console.log('\nOrder number:');
    const orderNumber = await page.locator('h1, .order-number').first().textContent();
    console.log('  ', orderNumber);

    // Look for tables
    console.log('\nTables on page:');
    const tables = await page.locator('table').all();
    console.log(`  Found ${tables.length} tables`);
    for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const classes = await table.getAttribute('class');
        console.log(`  Table ${i + 1}: class="${classes}"`);
    }

    // Look for invoice link
    console.log('\nLooking for invoice link:');
    const invoiceLinks = await page.locator('a').all();
    for (const link of invoiceLinks) {
        const href = await link.getAttribute('href');
        const text = await link.textContent();
        if (href && (href.includes('invoice') || href.includes('factura') || text?.toLowerCase().includes('invoice') || text?.toLowerCase().includes('factura'))) {
            console.log(`  Found: ${text} -> ${href}`);
        }
    }

    await browser.close();
}

debugOrderDetail().catch(console.error);
