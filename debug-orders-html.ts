/**
 * Debug: Fetch real orders page HTML to see structure
 */

const baseUrl = 'https://skuterzonepro.com';
const username = 'simon@sfx-ecommerce.com';
const password = 'Skutoonge01!';

async function fetchOrdersPage() {
    console.log('Logging in...');

    // Step 1: Get nonce
    const loginPageRes = await fetch(`${baseUrl}/my-account/`);
    const loginPageHtml = await loginPageRes.text();
    const nonceMatch = loginPageHtml.match(/name="woocommerce-login-nonce"\s+value="([^"]+)"/);
    const nonce = nonceMatch ? nonceMatch[1] : '';

    // Step 2: Login
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

    // Parse cookies
    const setCookies = loginRes.headers.get('set-cookie') || '';
    const cookies = setCookies
        .split(/,\s*(?=[a-zA-Z0-9_-]+=)/)
        .map(cookie => cookie.split(';')[0])
        .join('; ');

    console.log('Logged in! Cookies:', cookies.substring(0, 100) + '...');

    // Step 3: Fetch orders page
    console.log('\nFetching orders page...');
    const ordersRes = await fetch(`${baseUrl}/my-account/orders/`, {
        headers: { 'Cookie': cookies, 'User-Agent': 'Mozilla/5.0' },
    });

    const ordersHtml = await ordersRes.text();

    console.log('Orders page length:', ordersHtml.length, 'chars');

    // Check for table
    const hasTable = ordersHtml.includes('woocommerce-orders-table');
    console.log('Has woocommerce-orders-table:', hasTable);

    if (hasTable) {
        // Extract table HTML
        const tableMatch = ordersHtml.match(/<table[^>]*class="[^"]*woocommerce-orders-table[^"]*"[^>]*>(.*?)<\/table>/s);
        if (tableMatch) {
            console.log('\n=== ORDERS TABLE HTML ===\n');
            console.log(tableMatch[0].substring(0, 3000)); // First 3000 chars
            console.log('\n... (truncated)');
        }
    } else {
        // Search for "pedido" or "order"
        const pedidoIndex = ordersHtml.toLowerCase().indexOf('pedido');
        const orderIndex = ordersHtml.toLowerCase().indexOf('order');

        if (pedidoIndex > -1) {
            console.log('\nFound "pedido" at index', pedidoIndex);
            console.log('Context (500 chars):');
            console.log(ordersHtml.substring(pedidoIndex - 200, pedidoIndex + 300));
        }

        if (orderIndex > -1 && orderIndex !== pedidoIndex) {
            console.log('\nFound "order" at index', orderIndex);
            console.log('Context (500 chars):');
            console.log(ordersHtml.substring(orderIndex - 200, orderIndex + 300));
        }

        // Look for any table
        const anyTableMatch = ordersHtml.match(/<table[^>]*>(.*?)<\/table>/s);
        if (anyTableMatch) {
            console.log('\n=== FOUND A TABLE (not orders-table class) ===\n');
            console.log(anyTableMatch[0].substring(0, 2000));
        }
    }
}

fetchOrdersPage().catch(console.error);
