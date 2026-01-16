/**
 * Test Script for NocoDB and SeaTable APIs
 *
 * Tests both selfhosted NocoDB and cloud SeaTable connections
 */

import { NocoDBClient } from './src/lib/biz/nocodb/index.js';
import { SeaTableClient } from './src/lib/biz/seatable.js';

async function testNocoDB() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔵 Testing NocoDB (Selfhosted)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
        const client = NocoDBClient.fromConfig();

        console.log('✓ Client initialized');
        console.log(`  Base URL: https://nocodb.sfx-ecommerce.com`);
        console.log(`  Workspace: ${client.workspaceId}`);
        console.log('');

        // Test: Get current user info
        console.log('📡 Fetching user info...');
        const user = await client.getCurrentUser();
        console.log('✓ Connected as:', JSON.stringify(user, null, 2));
        console.log('');

        // Try to list projects via raw API
        console.log('📡 Attempting to fetch projects/bases...');
        try {
            const response = await client.rawApi.base.list();
            console.log('✓ Available bases/projects:');
            console.log(JSON.stringify(response, null, 2));
        } catch (error) {
            console.log('⚠️  Could not list projects directly. Error:', (error as Error).message);
            console.log('   This is normal for selfhosted instances - we need the project name.');
        }

        console.log('\n💡 Next steps:');
        console.log('   1. Go to https://nocodb.sfx-ecommerce.com/dashboard');
        console.log('   2. Find your project/base name');
        console.log('   3. Provide the project and table name to query data');
        console.log('');
        console.log('   Example: husky biz nocodb list <project> <table>');

        return { success: true };

    } catch (error) {
        console.error('❌ NocoDB Error:', (error as Error).message);
        if ((error as any).response) {
            console.error('   Response:', (error as any).response);
        }
        return { success: false, error: (error as Error).message };
    }
}

async function testSeaTable() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🟢 Testing SeaTable (Cloud)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
        const client = SeaTableClient.fromConfig();

        console.log('✓ Client initialized');
        console.log(`  Server: https://cloud.seatable.io`);
        console.log('');

        // Test: Get metadata (list tables)
        console.log('📡 Fetching base metadata...');
        const metadata = await client.getMetadata();

        console.log(`✓ Connected to SeaTable base`);
        console.log(`  Tables: ${metadata.tables.length}`);
        console.log('');

        console.log('📋 Available tables:');
        for (const table of metadata.tables) {
            console.log(`  • ${table.name.padEnd(30)} (${table.columns.length} columns)`);
        }

        if (metadata.tables.length > 0) {
            const firstTable = metadata.tables[0];
            console.log(`\n📊 Sample table: "${firstTable.name}"`);
            console.log('   Columns:');
            for (const col of firstTable.columns.slice(0, 5)) {
                console.log(`     - ${col.name} (${col.type})`);
            }
            if (firstTable.columns.length > 5) {
                console.log(`     ... and ${firstTable.columns.length - 5} more`);
            }

            // Try to fetch first few rows
            console.log(`\n📡 Fetching sample rows from "${firstTable.name}"...`);
            try {
                const rows = await client.listRows({
                    table_name: firstTable.name,
                    limit: 3
                });
                console.log(`✓ Retrieved ${rows.length} rows`);
                if (rows.length > 0) {
                    console.log('\nSample row:');
                    console.log(JSON.stringify(rows[0], null, 2));
                }
            } catch (error) {
                console.log('⚠️  Could not fetch rows:', (error as Error).message);
            }
        }

        return { success: true };

    } catch (error) {
        console.error('❌ SeaTable Error:', (error as Error).message);
        return { success: false, error: (error as Error).message };
    }
}

async function main() {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  API Connection Test                       ║');
    console.log('║  NocoDB (Selfhosted) + SeaTable (Cloud)   ║');
    console.log('╚════════════════════════════════════════════╝');

    const results = {
        nocodb: await testNocoDB(),
        seatable: await testSeaTable()
    };

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`NocoDB:   ${results.nocodb.success ? '✅ Connected' : '❌ Failed'}`);
    console.log(`SeaTable: ${results.seatable.success ? '✅ Connected' : '❌ Failed'}`);
    console.log('');

    if (!results.nocodb.success || !results.seatable.success) {
        process.exit(1);
    }
}

main().catch(error => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
});
