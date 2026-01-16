const baseUrl = 'https://skuterzonepro.com';
const username = 'simon@sfx-ecommerce.com';
const password = 'Skutoonge01!';

async function test() {
    // Step 1: Get nonce
    const loginPageRes = await fetch(`${baseUrl}/my-account/`);
    const loginPageHtml = await loginPageRes.text();
    const nonceMatch = loginPageHtml.match(/name="woocommerce-login-nonce"\s+value="([^"]+)"/);
    const nonce = nonceMatch ? nonceMatch[1] : '';
    console.log('Nonce:', nonce);

    // Step 2: Submit login WITHOUT following redirects
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
        redirect: 'manual', // Don't follow redirects
    });

    console.log('\nLogin response:');
    console.log('  Status:', loginRes.status);
    console.log('  Location:', loginRes.headers.get('location') || 'NONE');

    // Collect ALL cookies from the response
    const allCookies: string[] = [];
    const rawHeaders = (loginRes.headers as any).raw ? (loginRes.headers as any).raw() : null;

    if (rawHeaders && rawHeaders['set-cookie']) {
        // Node.js fetch returns array of Set-Cookie headers
        allCookies.push(...rawHeaders['set-cookie']);
    } else {
        // Fallback: try to get from regular headers
        const setCookie = loginRes.headers.get('set-cookie');
        if (setCookie) allCookies.push(setCookie);
    }

    console.log('\nAll Set-Cookie headers:', allCookies.length);
    allCookies.forEach((cookie, i) => {
        const name = cookie.split('=')[0];
        console.log(`  [${i}] ${name}`);
    });

    // Parse all cookies into Cookie header format
    const cookieHeader = allCookies
        .map(cookie => cookie.split(';')[0]) // Get name=value only
        .join('; ');

    console.log('\nCookie header:', cookieHeader);

    // Step 3: Follow redirect manually if there is one
    const locationHeader = loginRes.headers.get('location');
    if (locationHeader) {
        console.log('\nFollowing redirect to:', locationHeader);

        const redirectUrl = locationHeader.startsWith('http') ? locationHeader : `${baseUrl}${locationHeader}`;

        const redirectRes = await fetch(redirectUrl, {
            headers: {
                'Cookie': cookieHeader,
                'User-Agent': 'Mozilla/5.0',
            },
        });

        console.log('  Redirect status:', redirectRes.status);
        console.log('  Final URL:', redirectRes.url);
    }

    // Step 4: Now try to access orders page
    console.log('\nAccessing orders page...');
    const ordersRes = await fetch(`${baseUrl}/my-account/orders/`, {
        headers: {
            'Cookie': cookieHeader,
            'User-Agent': 'Mozilla/5.0',
        },
    });

    const ordersHtml = await ordersRes.text();

    const hasWpLogin = ordersHtml.includes('wp-login.php');
    const hasOrdersTable = ordersHtml.includes('woocommerce-orders-table');
    const hasLoggedIn = ordersHtml.includes('logged-in');

    console.log('\nOrders page check:');
    console.log('  Has wp-login redirect:', hasWpLogin);
    console.log('  Has orders table:', hasOrdersTable);
    console.log('  Has logged-in class:', hasLoggedIn);

    if (hasOrdersTable) {
        console.log('\n✓ SUCCESS! Can access orders page');
    } else if (!hasWpLogin && hasLoggedIn) {
        console.log('\n⚠ Logged in but no orders table found');
        console.log('HTML sample:', ordersHtml.substring(0, 500));
    } else {
        console.log('\n✗ FAILED to log in');
    }
}

test().catch(console.error);
