import { NocoDBClient } from './src/lib/biz/nocodb/index.js';

async function main() {
    const nocodb = NocoDBClient.fromConfig();

    console.log('Testing Junction Table API...\n');

    try {
        // Try to add a relation using the API
        // Note: We need real IDs to test this
        // Let's first get a Parts New entry and a ListingFeed entry

        console.log('1. Getting sample Parts New entry...');
        const partsResult = await nocodb.records.list('Product Data Management', 'Parts New', {
            limit: 1
        });

        if (!partsResult.list || partsResult.list.length === 0) {
            console.log('No Parts New entries found - need to create data first');
            return;
        }

        const partsEntry = partsResult.list[0];
        console.log(`   Found Parts New ID: ${partsEntry.Id}`);

        console.log('\n2. Getting sample ListingFeed entry...');
        const listingResult = await nocodb.records.list('Product Data Management', 'ListingFeed', {
            limit: 1
        });

        if (!listingResult.list || listingResult.list.length === 0) {
            console.log('No ListingFeed entries found - need to create data first');
            return;
        }

        const listingEntry = listingResult.list[0];
        console.log(`   Found ListingFeed ID: ${listingEntry.Id}`);

        console.log('\n3. Attempting to link via API (relations.add)...');
        try {
            // Try to add relation using the API
            await nocodb.relations.add(
                'Product Data Management',
                'ListingFeed',
                listingEntry.Id,
                'mm',  // many-to-many
                'Parts New',  // Assuming this is the column name
                partsEntry.Id
            );
            console.log('   ✅ SUCCESS! Junction table API works!');
        } catch (apiError: any) {
            console.log(`   ❌ API failed: ${apiError.message}`);
            console.log('\n   Will need to use SQL fallback.');
        }

    } catch (error: any) {
        console.error('Error:', error.message);
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
