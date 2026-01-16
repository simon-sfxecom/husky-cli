"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_1 = require("playwright");
async function debugLoginPage() {
    const browser = await playwright_1.chromium.launch({ headless: false });
    const page = await browser.newPage();
    try {
        console.log('Navigating to login page...');
        await page.goto('https://www.wattiz.fr/gb/login');
        await page.waitForLoadState('networkidle').catch(() => { });
        console.log('Current URL:', page.url());
        console.log('\nPage title:', await page.title());
        // Check for different login form patterns
        const emailInput = await page.locator('input[name="email"]').count();
        const usernameInput = await page.locator('input#username').count();
        const loginInput = await page.locator('input[type="email"]').count();
        const allInputs = await page.locator('input').count();
        console.log('\nForm fields found:');
        console.log('  input[name="email"]:', emailInput);
        console.log('  input#username:', usernameInput);
        console.log('  input[type="email"]:', loginInput);
        console.log('  Total inputs:', allInputs);
        // Get all input names and IDs
        console.log('\nAll input fields:');
        const inputs = page.locator('input');
        for (let i = 0; i < await inputs.count(); i++) {
            const input = inputs.nth(i);
            const name = await input.getAttribute('name');
            const id = await input.getAttribute('id');
            const type = await input.getAttribute('type');
            const placeholder = await input.getAttribute('placeholder');
            console.log(`  [${i}] type="${type}" name="${name}" id="${id}" placeholder="${placeholder}"`);
        }
        // Take screenshot
        await page.screenshot({ path: '/home/simonfestl/documents/huskyv0/packages/cli/wattiz-login.png' });
        console.log('\nScreenshot saved to wattiz-login.png');
        await page.waitForTimeout(5000);
    }
    catch (error) {
        console.error('Error:', error);
    }
    finally {
        await browser.close();
    }
}
debugLoginPage();
