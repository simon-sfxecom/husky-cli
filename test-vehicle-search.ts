import { NocoDBClient } from './src/lib/biz/nocodb/index.js';

async function main() {
    const nocodb = NocoDBClient.fromConfig();

    console.log('Testing vehicle variant search...\n');

    // List some vehicles first
    console.log('1. Listing all vehicle variants (first 10)...');
    const all = await nocodb.records.list('Product Data Management', 'VehicleModelsVariants', {
        limit: 10
    });

    console.log(`Found ${all.list?.length || 0} variants:`);
    all.list?.forEach((v: any) => {
        console.log(`  - ID ${v.Id}: ${v.VariantName || 'N/A'}`);
    });

    console.log('\n2. Testing search for "Ninebot"...');

    // Try different where syntaxes with correct field name
    const searchTerms = [
        { syntax: '(VariantName,like,%Ninebot%)', desc: 'LIKE with wildcards' },
        { syntax: '(VariantName,like,%G30%)', desc: 'LIKE G30' },
        { syntax: '(VariantName,eq,Ninebot Max G30D II)', desc: 'Exact match' },
    ];

    for (const { syntax, desc } of searchTerms) {
        try {
            console.log(`\n   Trying: ${desc}`);
            console.log(`   Query: where=${syntax}`);

            const results = await nocodb.records.list('Product Data Management', 'VehicleModelsVariants', {
                where: syntax,
                limit: 5
            });

            console.log(`   ✓ Success! Found ${results.list?.length || 0} results`);
            results.list?.slice(0, 3).forEach((v: any) => {
                console.log(`     - ${v.VariantName}`);
            });
        } catch (error: any) {
            console.log(`   ❌ Failed: ${error.message}`);
        }
    }
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
