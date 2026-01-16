import { chromium } from 'playwright';

async function debugLogin() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('https://skuterzonepro.com/my-account/');
    await page.waitForLoadState('networkidle');

    // Take a screenshot
    await page.screenshot({ path: '/tmp/skuterzone-login-page.png', fullPage: true });

    // Save HTML
    const html = await page.content();
    await import('fs').then(fs => fs.promises.writeFile('/tmp/skuterzone-login-page.html', html));

    console.log('✓ Screenshot saved to /tmp/skuterzone-login-page.png');
    console.log('✓ HTML saved to /tmp/skuterzone-login-page.html');

    // Check for username field
    const usernameVisible = await page.locator('input[name="username"]').isVisible().catch(() => false);
    console.log('Username field visible:', usernameVisible);

    // List all input fields
    const inputs = await page.locator('input').all();
    console.log('\nAll input fields on page:');
    for (const input of inputs) {
        const type = await input.getAttribute('type');
        const name = await input.getAttribute('name');
        const id = await input.getAttribute('id');
        const visible = await input.isVisible();
        console.log(`  - type="${type}" name="${name}" id="${id}" visible=${visible}`);
    }

    await browser.close();
}

debugLogin().catch(console.error);
