import { SeaTableClient } from './src/lib/biz/seatable.js';

async function main() {
    const seatable = SeaTableClient.fromConfig();

    console.log('Fetching sample eBay Listings...\n');

    const listings = await seatable.listRows({
        table_name: 'eBay Listings',
        limit: 10
    });

    console.log(`Found ${listings.length} listings:\n`);

    for (const listing of listings) {
        console.log('─'.repeat(60));
        console.log(`SKU: ${listing.SKU || listing['0000']}`);
        console.log(`Title: ${listing.Title || listing['4cdo']}`);
        console.log(`Price: €${listing.Price || listing['4VVt']}`);
        console.log(`Compatible with: ${listing['Compatible with'] || listing['Oc8R'] || 'N/A'}`);
        console.log(`Has CompatibleList: ${listing.CompatibleList || listing['e93x'] ? 'Yes' : 'No'}`);
        console.log(`Type: ${listing.Type || 'N/A'}`);
        console.log('');
    }
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
