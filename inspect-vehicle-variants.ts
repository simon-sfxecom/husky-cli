/**
 * Inspect VehicleModelsVariants table structure
 */
import { NocoDBClient } from './src/lib/biz/nocodb/index.js';

async function main() {
    const nocodb = NocoDBClient.fromConfig();

    console.log('Fetching VehicleModelsVariants entries...\n');

    const results = await nocodb.records.list('Product Data Management', 'VehicleModelsVariants', {
        limit: 5
    });

    console.log(`Found ${results.list?.length || 0} entries\n`);

    if (results.list && results.list.length > 0) {
        console.log('First entry (full structure):');
        console.log(JSON.stringify(results.list[0], null, 2));

        console.log('\n' + '='.repeat(70));
        console.log('\nAll available field names:');
        console.log(Object.keys(results.list[0]).join(', '));
    }
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
