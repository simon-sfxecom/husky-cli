import * as fs from 'fs';

const baseUrl = 'https://skuterzonepro.com';
const username = 'simon@sfx-ecommerce.com';
const password = 'Skutoonge01!';

async function saveOrdersHtml() {
    // Login
    const loginPageRes = await fetch(`${baseUrl}/my-account/`);
    const loginPageHtml = await loginPageRes.text();
    const nonceMatch = loginPageHtml.match(/name="woocommerce-login-nonce"\s+value="([^"]+)"/);
    const nonce = nonceMatch ? nonceMatch[1] : '';

    const formData = new URLSearchParams({
        username, password,
        'woocommerce-login-nonce': nonce,
        '_wp_http_referer': '/my-account/',
        'login': 'Log in',
    });

    const loginRes = await fetch(`${baseUrl}/my-account/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
        body: formData,
        redirect: 'manual',
    });

    const setCookies = loginRes.headers.get('set-cookie') || '';
    const cookies = setCookies
        .split(/,\s*(?=[a-zA-Z0-9_-]+=)/)
        .map(cookie => cookie.split(';')[0])
        .join('; ');

    // Fetch orders page
    const ordersRes = await fetch(`${baseUrl}/my-account/orders/`, {
        headers: { 'Cookie': cookies, 'User-Agent': 'Mozilla/5.0' },
    });

    const html = await ordersRes.text();

    // Save to file
    const filename = '/tmp/skuterzone-orders.html';
    fs.writeFileSync(filename, html);
    console.log(`✓ Saved orders page HTML to: ${filename}`);
    console.log(`  File size: ${(html.length / 1024).toFixed(1)} KB`);
    console.log('\nYou can now inspect it:');
    console.log(`  cat ${filename} | grep -i "pedido" -A 10 -B 10`);
    console.log(`  cat ${filename} | grep -i "table" -A 20`);
}

saveOrdersHtml().catch(console.error);
