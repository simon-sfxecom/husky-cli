import { chromium } from 'playwright';

async function testSelectors() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Login
    await page.goto('https://skuterzonepro.com/my-account/');
    await page.waitForLoadState('networkidle');
    await page.fill('input#username', 'simon@sfx-ecommerce.com');
    await page.fill('input#password', 'Skutoonge01!');
    await page.click('button[name="login"]');
    await page.waitForLoadState('networkidle');

    // Go to order
    await page.goto('https://skuterzonepro.com/my-account/view-order/116096/');
    await page.waitForLoadState('networkidle');

    console.log('Testing selectors:');
    console.log('');

    // Test order number
    const orderNumber = await page.locator('mark.order-number').textContent();
    console.log('Order number:', orderNumber);

    // Test order date
    const orderDate = await page.locator('mark.order-date').textContent();
    console.log('Order date:', orderDate);

    // Test order status
    const orderStatus = await page.locator('mark.order-status').textContent();
    console.log('Order status:', orderStatus);

    // Test email
    const email = await page.locator('.woocommerce-customer-details--email').textContent();
    console.log('Email:', email);

    // Test phone
    const phone = await page.locator('.woocommerce-customer-details--phone').textContent();
    console.log('Phone:', phone);

    // Test invoice link
    const invoiceLink = await page.locator('a.print-invoice').first().getAttribute('href');
    console.log('Invoice link:', invoiceLink);

    // Test total
    const total = await page.locator('table.woocommerce-table--order-details tfoot tr:last-child .woocommerce-Price-amount').textContent();
    console.log('Total:', total);

    // Test items count
    const itemRows = page.locator('table.woocommerce-table--order-details tbody tr.woocommerce-table__line-item');
    const itemCount = await itemRows.count();
    console.log('Items count:', itemCount);

    if (itemCount > 0) {
        console.log('\nFirst item:');
        const firstRow = itemRows.first();
        const name = await firstRow.locator('.woocommerce-table__product-name').textContent();
        const qty = await firstRow.locator('.product-quantity').textContent();
        const itemTotal = await firstRow.locator('.woocommerce-table__product-total').textContent();
        console.log('  Name:', name);
        console.log('  Qty:', qty);
        console.log('  Total:', itemTotal);
    }

    await browser.close();
}

testSelectors().catch(console.error);
