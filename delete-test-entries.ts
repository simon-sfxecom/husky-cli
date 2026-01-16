/**
 * Delete test migration entries
 */
import { NocoDBClient } from './src/lib/biz/nocodb/index.js';

async function main() {
    const nocodb = NocoDBClient.fromConfig();

    console.log('Deleting test migration entries...\n');

    // Delete eBayFeed entries
    for (const id of [812, 813, 814]) {
        try {
            await nocodb.records.delete('Product Data Management', 'eBayFeed', id);
            console.log(`✓ Deleted eBayFeed ID ${id}`);
        } catch (e) {
            console.log(`⚠️  eBayFeed ${id} not found or already deleted`);
        }
    }

    // Delete ListingFeed entries
    for (const id of [831, 832, 833]) {
        try {
            await nocodb.records.delete('Product Data Management', 'ListingFeed', id);
            console.log(`✓ Deleted ListingFeed ID ${id}`);
        } catch (e) {
            console.log(`⚠️  ListingFeed ${id} not found or already deleted`);
        }
    }

    // Delete Parts New entries
    for (const id of [1012, 1013, 1014, 1015, 1016, 1017]) {
        try {
            await nocodb.records.delete('Product Data Management', 'Parts New', id);
            console.log(`✓ Deleted Parts New ID ${id}`);
        } catch (e) {
            console.log(`⚠️  Parts New ${id} not found or already deleted`);
        }
    }

    console.log('\nCleanup complete!');
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
