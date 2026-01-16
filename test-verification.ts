const baseUrl = 'https://skuterzonepro.com';
const username = 'simon@sfx-ecommerce.com';
const password = 'Skutoonge01!';

async function test() {
    // Login with nonce
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

    // Parse cookies correctly (split by comma, take name=value only)
    const setCookies = loginRes.headers.get('set-cookie') || '';
    const cookies = setCookies
        .split(/,\s*(?=[a-zA-Z0-9_-]+=)/)
        .map(cookie => cookie.split(';')[0])
        .join('; ');

    console.log('Parsed cookies:', cookies);

    // Now fetch orders page
    const ordersRes = await fetch(`${baseUrl}/my-account/orders/`, {
        headers: { 'Cookie': cookies, 'User-Agent': 'Mozilla/5.0' },
    });

    const ordersHtml = await ordersRes.text();

    // Check for verification indicators
    const hasWpLogin = ordersHtml.includes('wp-login.php');
    const hasOrdersTable = ordersHtml.includes('woocommerce-orders-table');
    const hasNoOrders = ordersHtml.includes('No orders');
    const hasLoggedIn = ordersHtml.includes('logged-in');

    console.log('\nVerification results:');
    console.log('  Has wp-login.php:', hasWpLogin);
    console.log('  Has woocommerce-orders-table:', hasOrdersTable);
    console.log('  Has "No orders":', hasNoOrders);
    console.log('  Has logged-in class:', hasLoggedIn);

    // My code logic
    const isLoggedInCheck = !hasWpLogin && (hasOrdersTable || hasNoOrders);
    console.log('\nWould pass verification:', isLoggedInCheck);

    if (!isLoggedInCheck) {
        console.log('\nHTML sample (first 2000 chars):');
        console.log(ordersHtml.substring(0, 2000));
    } else {
        console.log('\n✓ Login successful!');

        // Try to extract orders if any
        if (hasOrdersTable) {
            console.log('\nLooking for orders in table...');
            const tableMatch = ordersHtml.match(/<table[^>]*woocommerce-orders-table[^>]*>(.*?)<\/table>/s);
            if (tableMatch) {
                console.log('Found orders table (length:', tableMatch[1].length, 'chars)');
            }
        }
    }
}

test().catch(console.error);
