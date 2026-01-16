import { NocoDBClient } from './src/lib/biz/nocodb/index.js';

async function main() {
    const API_TOKEN = process.env.PROD_NOCODB_API_TOKEN!;
    const BASE_URL = process.env.PROD_NOCODB_BASE_URL!;

    const headers = {
        'xc-token': API_TOKEN,
        'Content-Type': 'application/json'
    };

    // Get Product Data Management base
    const basesRes = await fetch(`${BASE_URL}/api/v2/meta/bases`, { headers });
    const basesData = await basesRes.json();
    const bases = (basesData as any).list || [];
    const pdmBase = bases.find((b: any) => b.title === 'Product Data Management');

    if (!pdmBase) {
        console.log('Base not found');
        return;
    }

    // Get tables
    const tablesRes = await fetch(`${BASE_URL}/api/v2/meta/bases/${pdmBase.id}/tables`, { headers });
    const tablesData = await tablesRes.json();
    const tables = (tablesData as any).list || [];

    const ebayFeed = tables.find((t: any) => t.title === 'eBayFeed');

    if (!ebayFeed) {
        console.log('eBayFeed table not found');
        return;
    }

    console.log('eBayFeed Table Columns:\n');

    // Get columns
    const colsRes = await fetch(`${BASE_URL}/api/v2/meta/tables/${ebayFeed.id}/columns`, { headers });
    const colsData = await colsRes.json();
    const columns = (colsData as any).list || [];

    console.log('Field Name (title) → Column Type');
    console.log('═'.repeat(60));

    for (const col of columns) {
        const isRequired = col.rqd ? ' (REQUIRED)' : '';
        console.log(`${col.title.padEnd(40)} → ${col.uidt}${isRequired}`);
    }

    console.log(`\nTotal: ${columns.length} columns`);
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
