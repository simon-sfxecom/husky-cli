/**
 * Debug script to test skuterzonepro.com login
 */

const baseUrl = 'https://skuterzonepro.com';
const username = 'simon@sfx-ecommerce.com';
const password = 'Skutoonge01!';

async function debugLogin() {
    console.log('Step 1: Fetching login page to get nonce...');

    const loginPageRes = await fetch(`${baseUrl}/my-account/`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Husky/1.0)',
        },
    });

    const loginPageHtml = await loginPageRes.text();
    console.log('Login page status:', loginPageRes.status);

    // Extract nonce from login page
    const nonceMatch = loginPageHtml.match(/name="woocommerce-login-nonce"\s+value="([^"]+)"/);
    const nonce = nonceMatch ? nonceMatch[1] : '';
    console.log('Nonce found:', nonce || 'NO NONCE');

    console.log('\nStep 2: Submitting login form...');

    const formData = new URLSearchParams({
        username: username,
        password: password,
        'woocommerce-login-nonce': nonce,
        '_wp_http_referer': '/my-account/',
        'login': 'Log in',
    });

    const loginRes = await fetch(`${baseUrl}/my-account/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (compatible; Husky/1.0)',
        },
        body: formData,
        redirect: 'manual',
    });

    console.log('Login response status:', loginRes.status);
    console.log('Login response headers:', Object.fromEntries(loginRes.headers.entries()));

    const setCookies = loginRes.headers.get('set-cookie');
    console.log('\nSet-Cookie header:', setCookies ? 'YES' : 'NO');
    if (setCookies) {
        console.log('Cookies:', setCookies.substring(0, 200) + '...');
    }

    console.log('\nStep 3: Verifying login by accessing orders page...');

    if (!setCookies) {
        console.error('ERROR: No cookies received!');
        const bodyText = await loginRes.text();
        console.log('Response body sample:', bodyText.substring(0, 500));
        return;
    }

    const verifyRes = await fetch(`${baseUrl}/my-account/orders/`, {
        headers: {
            'Cookie': setCookies,
            'User-Agent': 'Mozilla/5.0 (compatible; Husky/1.0)',
        },
    });

    const verifyHtml = await verifyRes.text();
    console.log('Verification status:', verifyRes.status);

    const hasLoginForm = verifyHtml.includes('wp-login.php');
    const hasOrders = verifyHtml.includes('woocommerce-orders-table') || verifyHtml.includes('No orders');

    console.log('Has login redirect:', hasLoginForm ? 'YES (FAILED)' : 'NO');
    console.log('Has orders content:', hasOrders ? 'YES (SUCCESS!)' : 'NO');

    if (!hasOrders && !hasLoginForm) {
        console.log('\nHTML sample (first 1000 chars):');
        console.log(verifyHtml.substring(0, 1000));
    }
}

debugLogin().catch(console.error);
