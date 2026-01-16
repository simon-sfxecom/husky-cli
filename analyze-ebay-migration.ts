/**
 * eBay Listings Migration Analysis
 *
 * Analyzes the relationship between eBay Listings and Vehicle Compatibility
 */

import { SeaTableClient } from './src/lib/biz/seatable.js';
import { NocoDBClient } from './src/lib/biz/nocodb/index.js';
import { writeFileSync } from 'fs';

async function analyzeSeaTableStructure() {
    const client = SeaTableClient.fromConfig();

    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  SeaTable eBay Listings Analysis          ║');
    console.log('╚════════════════════════════════════════════╝\n');

    // 1. Get eBay Listings structure
    const metadata = await client.getMetadata();
    const ebayTable = metadata.tables.find(t => t.name === 'eBay Listings');

    if (!ebayTable) {
        throw new Error('eBay Listings table not found!');
    }

    console.log('📋 eBay Listings Table Structure:\n');
    console.log(`   Columns: ${ebayTable.columns.length}\n`);

    // Find link columns
    const linkColumns = ebayTable.columns.filter(c => c.type === 'link');
    console.log('🔗 Link Columns (Relations):');
    for (const col of linkColumns) {
        const data = col.data as any;
        console.log(`   • ${col.name.padEnd(40)} → ${data?.table_id || 'unknown table'}`);
    }
    console.log('');

    // Find key columns
    const keyColumns = ['SKU', 'Title', 'Price', 'Compatible with', 'CompatibleList', 'Compatible'];
    console.log('🔑 Key Columns for Migration:');
    for (const colName of keyColumns) {
        const col = ebayTable.columns.find(c => c.name === colName);
        if (col) {
            console.log(`   ✓ ${col.name.padEnd(40)} (${col.type})`);
        } else {
            console.log(`   ✗ ${colName.padEnd(40)} (NOT FOUND)`);
        }
    }
    console.log('');

    // 2. Get sample eBay Listing with all related data
    console.log('📊 Fetching Sample eBay Listing...\n');
    const sampleListings = await client.listRows({
        table_name: 'eBay Listings',
        limit: 1
    });

    if (sampleListings.length === 0) {
        console.log('⚠️  No eBay Listings found!');
        return;
    }

    const sampleListing = sampleListings[0];
    console.log('Sample Listing:');
    console.log(`   SKU: ${sampleListing.SKU}`);
    console.log(`   Title: ${sampleListing.Title}`);
    console.log(`   Price: ${sampleListing.Price}`);
    console.log(`   Compatible with: ${sampleListing['Compatible with'] || 'N/A'}`);
    console.log(`   CompatibleList: ${sampleListing.CompatibleList || 'N/A'}`);
    console.log('');

    // Check if there's a Compatible link
    const compatibleLinkCol = ebayTable.columns.find(c => c.name === 'Compatible');
    if (compatibleLinkCol) {
        const linkData = compatibleLinkCol.data as any;
        console.log(`🔗 Compatible Link Column:`);
        console.log(`   Type: ${compatibleLinkCol.type}`);
        console.log(`   Links to: ${linkData?.table_name || linkData?.table_id || 'unknown'}`);
        console.log(`   Link ID: ${linkData?.link_id || 'N/A'}`);
        console.log('');

        // Get the linked Compatible records
        const compatibleValue = sampleListing.Compatible;
        if (compatibleValue && Array.isArray(compatibleValue) && compatibleValue.length > 0) {
            console.log(`   ✓ Sample listing has ${compatibleValue.length} compatible records`);
            console.log(`   Compatible IDs: ${compatibleValue.join(', ')}`);
            console.log('');
        }
    }

    // 3. Analyze Compatible table structure
    const compatibleTable = metadata.tables.find(t => t.name === 'Compatible');
    if (compatibleTable) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 Compatible Table Structure:\n');
        console.log(`   Columns: ${compatibleTable.columns.length}\n`);

        const linkCols = compatibleTable.columns.filter(c => c.type === 'link');
        console.log('🔗 Link Columns in Compatible Table:');
        for (const col of linkCols) {
            const data = col.data as any;
            console.log(`   • ${col.name.padEnd(40)} → ${data?.table_name || data?.table_id || 'unknown'}`);
        }
        console.log('');

        // Get a sample Compatible record
        const compatibleRecords = await client.listRows({
            table_name: 'Compatible',
            limit: 1
        });

        if (compatibleRecords.length > 0) {
            const sample = compatibleRecords[0];
            console.log('Sample Compatible Record:');
            console.log(`   Name: ${sample.Name}`);
            console.log(`   SKU: ${sample.SKU}`);
            console.log(`   Producttype: ${sample.Producttype}`);
            console.log('');

            // Check VehicleModels link
            if (sample.VehicleModels) {
                console.log(`   ✓ Links to VehicleModels: ${Array.isArray(sample.VehicleModels) ? sample.VehicleModels.length + ' models' : sample.VehicleModels}`);
            }

            // Check CompatibleDevices links
            const deviceLinkCols = compatibleTable.columns.filter(c => c.name.startsWith('CompatibleDevices'));
            console.log(`   CompatibleDevices columns: ${deviceLinkCols.length}`);
        }
    }

    // 4. Analyze VehicleModels table
    const vehicleModelsTable = metadata.tables.find(t => t.name === 'VehicleModels');
    if (vehicleModelsTable) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 VehicleModels Table Structure:\n');
        console.log(`   Columns: ${vehicleModelsTable.columns.length}\n`);

        const keyVehicleCols = ['Name', 'Brand', 'ABE-Nr', 'Tire Size', 'BrakeType'];
        console.log('🔑 Key Vehicle Columns:');
        for (const colName of keyVehicleCols) {
            const col = vehicleModelsTable.columns.find(c => c.name === colName);
            if (col) {
                console.log(`   ✓ ${col.name.padEnd(40)} (${col.type})`);
            }
        }
        console.log('');

        // Get sample vehicle
        const vehicleRecords = await client.listRows({
            table_name: 'VehicleModels',
            limit: 1
        });

        if (vehicleRecords.length > 0) {
            const sample = vehicleRecords[0];
            console.log('Sample VehicleModel:');
            console.log(`   Name: ${sample.Name}`);
            console.log(`   Brand: ${sample.Brand}`);
            console.log(`   ABE-Nr: ${sample['ABE-Nr']}`);
            console.log('');
        }
    }

    // 5. Analyze CompatibleDevices table
    const compatibleDevicesTable = metadata.tables.find(t => t.name === 'CompatibleDevices');
    if (compatibleDevicesTable) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 CompatibleDevices Table Structure:\n');
        console.log(`   Columns: ${compatibleDevicesTable.columns.length}\n`);

        console.log('All Columns:');
        for (const col of compatibleDevicesTable.columns) {
            const typeDisplay = col.type.padEnd(20);
            console.log(`   • ${col.name.padEnd(40)} (${typeDisplay})`);
        }
    }

    // Save full sample for analysis
    const fullSample = {
        ebayListing: sampleListing,
        metadata: {
            ebayListingsColumns: ebayTable.columns.map(c => ({ name: c.name, type: c.type, key: c.key })),
            compatibleColumns: compatibleTable?.columns.map(c => ({ name: c.name, type: c.type, key: c.key })),
            vehicleModelsColumns: vehicleModelsTable?.columns.map(c => ({ name: c.name, type: c.type, key: c.key })),
            compatibleDevicesColumns: compatibleDevicesTable?.columns.map(c => ({ name: c.name, type: c.type, key: c.key })),
        }
    };

    writeFileSync('seatable-ebay-analysis.json', JSON.stringify(fullSample, null, 2));
    console.log('\n✅ Full analysis saved to: seatable-ebay-analysis.json\n');

    return fullSample;
}

async function analyzeNocoDBTarget() {
    const API_TOKEN = process.env.PROD_NOCODB_API_TOKEN!;
    const BASE_URL = process.env.PROD_NOCODB_BASE_URL!;

    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  NocoDB Target Structure Analysis         ║');
    console.log('╚════════════════════════════════════════════╝\n');

    const headers = {
        'xc-token': API_TOKEN,
        'Content-Type': 'application/json'
    };

    // Find Product Data Management base
    const basesRes = await fetch(`${BASE_URL}/api/v2/meta/bases`, { headers });
    const basesData = await basesRes.json();
    const bases = (basesData as any).list || [];

    const pdmBase = bases.find((b: any) => b.title === 'Product Data Management');
    if (!pdmBase) {
        console.log('⚠️  Product Data Management base not found!');
        return;
    }

    console.log(`📦 Product Data Management Base: ${pdmBase.id}\n`);

    // Get tables
    const tablesRes = await fetch(`${BASE_URL}/api/v2/meta/bases/${pdmBase.id}/tables`, { headers });
    const tablesData = await tablesRes.json();
    const tables = (tablesData as any).list || [];

    console.log('📋 Available Tables:');
    for (const table of tables) {
        console.log(`   • ${table.title} (${table.id})`);
    }
    console.log('');

    // Check if eBayFeed exists
    const ebayFeed = tables.find((t: any) => t.title === 'eBayFeed');
    if (ebayFeed) {
        console.log('✓ Found eBayFeed table - this will be our target!\n');
        console.log(`   Table ID: ${ebayFeed.id}`);
        console.log(`   Type: ${ebayFeed.type}`);
        console.log('');

        // Get columns (if we can)
        try {
            const colsRes = await fetch(`${BASE_URL}/api/v2/meta/tables/${ebayFeed.id}/columns`, { headers });
            const colsData = await colsRes.json();
            const columns = (colsData as any).list || [];

            console.log(`   Columns (${columns.length}):`);
            for (const col of columns.slice(0, 20)) {
                console.log(`      • ${col.title.padEnd(30)} (${col.uidt || col.dt})`);
            }
            if (columns.length > 20) {
                console.log(`      ... and ${columns.length - 20} more`);
            }
        } catch (error) {
            console.log(`   ⚠️  Could not fetch columns`);
        }
    }

    // Check Vehicles table
    const vehiclesTable = tables.find((t: any) => t.title === 'Vehicles');
    if (vehiclesTable) {
        console.log('\n✓ Found Vehicles table\n');
        console.log(`   Table ID: ${vehiclesTable.id}`);
    }

    // Check VehicleModels table
    const vehicleModelsTable = tables.find((t: any) => t.title.includes('VehicleModel'));
    if (vehicleModelsTable) {
        console.log('\n✓ Found VehicleModels table\n');
        console.log(`   Table ID: ${vehicleModelsTable.id}`);
        console.log(`   Title: ${vehicleModelsTable.title}`);
    }

    return { pdmBase, tables };
}

async function main() {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  eBay Listings Migration Analysis          ║');
    console.log('║  SeaTable → NocoDB                         ║');
    console.log('╚════════════════════════════════════════════╝');

    try {
        // Analyze source
        const seaTableAnalysis = await analyzeSeaTableStructure();

        // Analyze target
        const nocoDBAnalysis = await analyzeNocoDBTarget();

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📝 Migration Strategy Recommendation');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('Based on the analysis, here\'s the recommended approach:\n');

        console.log('🔄 Data Flow:');
        console.log('   1. eBay Listings (SeaTable)');
        console.log('      ↓');
        console.log('   2. Compatible (SeaTable) - via link');
        console.log('      ↓');
        console.log('   3. VehicleModels (SeaTable) - via link');
        console.log('      ↓');
        console.log('   4. eBayFeed (NocoDB) - with vehicle compatibility data');
        console.log('');

        console.log('📋 Migration Steps:');
        console.log('   Step 1: Extract eBay Listing from SeaTable');
        console.log('   Step 2: Follow Compatible link to get compatible products');
        console.log('   Step 3: For each compatible product, get VehicleModels');
        console.log('   Step 4: Flatten the data and insert into NocoDB eBayFeed');
        console.log('   Step 5: Create/update vehicle relations in NocoDB');
        console.log('');

        console.log('⚠️  Challenges:');
        console.log('   • Multiple CompatibleDevices columns (0-13) need to be handled');
        console.log('   • Link relationships need to be preserved or flattened');
        console.log('   • Vehicle compatibility might be stored differently in NocoDB');
        console.log('');

        console.log('💡 Next Steps:');
        console.log('   1. Review the saved analysis: seatable-ebay-analysis.json');
        console.log('   2. Decide on NocoDB schema: flatten or preserve relations?');
        console.log('   3. Create migration script with proper data transformation');
        console.log('');

    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    }
}

main();
