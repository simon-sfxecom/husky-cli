import { NocoDBClient } from './src/lib/biz/nocodb/index.js';
import { SeaTableClient } from './src/lib/biz/seatable.js';

async function main() {
    console.log('1. Checking what fields exist in NocoDB eBayFeed...\n');

    const nocodb = NocoDBClient.fromConfig();
    const result = await nocodb.records.list('Product Data Management', 'eBayFeed', {
        limit: 1
    });

    if (result.list && result.list.length > 0) {
        const sample = result.list[0];
        console.log('Sample eBayFeed entry fields:');
        console.log(JSON.stringify(sample, null, 2));
    }

    console.log('\n' + '═'.repeat(70));
    console.log('\n2. Checking SeaTable eBay Listing for NG0005...\n');

    const seatable = SeaTableClient.fromConfig();
    const listings = await seatable.listRows({
        table_name: 'eBay Listings',
        limit: 100
    });

    const ngListing = listings.find((l: any) => l.SKU === 'NG0005');
    if (ngListing) {
        console.log('NG0005 listing fields:');
        console.log(JSON.stringify(ngListing, null, 2));
    }
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
