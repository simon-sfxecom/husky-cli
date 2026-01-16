import { SeaTableClient } from './src/lib/biz/seatable.js';

async function main() {
    const seatable = SeaTableClient.fromConfig();
    const testSKU = 'NG0005';

    console.log(`Looking for Shopify listing matching SKU: ${testSKU}\n`);

    // Get Shopify listings and filter by SKU
    const allShopifyListings = await seatable.listRows({
        table_name: 'Shopify Listings',
        limit: 100
    });

    const shopifyResults = allShopifyListings.filter((listing: any) =>
        (listing.sku === testSKU) || (listing['0000'] === testSKU)
    );

    if (shopifyResults.length > 0) {
        console.log('✅ Found Shopify match!');
        for (const listing of shopifyResults) {
            console.log('─'.repeat(60));
            console.log(`SKU: ${listing.sku}`);
            console.log(`Title: ${listing.title}`);
            console.log(`Price: €${listing.price}`);
            console.log('');
        }
    } else {
        console.log('❌ No Shopify listing found with this SKU');
        console.log('\nLet me search for similar titles...\n');

        // Get eBay listing title
        const allEbayListings = await seatable.listRows({
            table_name: 'eBay Listings',
            limit: 100
        });
        const ebayResults = allEbayListings.filter((listing: any) =>
            (listing.SKU === testSKU) || (listing['0000'] === testSKU)
        );
        if (ebayResults.length > 0) {
            const ebayTitle = ebayResults[0].Title || ebayResults[0]['4cdo'];
            console.log(`eBay Title: ${ebayTitle}`);

            // Search for partial matches
            const allShopify = await seatable.listRows({
                table_name: 'Shopify Listings',
                limit: 20
            });

            console.log('\nSimilar Shopify listings:');
            for (const listing of allShopify) {
                const title = listing.title || '';
                if (title.toLowerCase().includes('gashebel') || title.toLowerCase().includes('ninebot')) {
                    console.log(`  - ${listing.sku}: ${title}`);
                }
            }
        }
    }
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
