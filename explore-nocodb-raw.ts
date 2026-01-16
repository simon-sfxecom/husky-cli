/**
 * NocoDB Schema Explorer using raw REST API
 */

async function exploreNocoDB() {
    const API_TOKEN = process.env.PROD_NOCODB_API_TOKEN!;
    const BASE_URL = process.env.PROD_NOCODB_BASE_URL!;

    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  NocoDB Full Schema (REST API)             ║');
    console.log('╚════════════════════════════════════════════╝\n');

    const headers = {
        'xc-token': API_TOKEN,
        'Content-Type': 'application/json'
    };

    // 1. Get all bases
    const basesRes = await fetch(`${BASE_URL}/api/v2/meta/bases`, { headers });
    const basesData = await basesRes.json();
    const bases = (basesData as any).list || [];

    console.log(`Found ${bases.length} bases\n`);

    const schemas: any = {};

    for (const base of bases) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📦 BASE: ${base.title} (${base.id})`);
        console.log(`${'='.repeat(80)}\n`);

        schemas[base.title] = { id: base.id, tables: [] };

        // 2. Get tables for this base
        const tablesRes = await fetch(`${BASE_URL}/api/v2/meta/bases/${base.id}/tables`, { headers });
        const tablesData = await tablesRes.json();
        const tables = (tablesData as any).list || [];

        console.log(`Tables: ${tables.length}\n`);

        for (const table of tables) {
            console.log(`\n  ┌─ TABLE: ${table.title} (${table.id})`);
            console.log(`  │  Type: ${table.type || 'table'}`);

            const tableSchema: any = {
                id: table.id,
                title: table.title,
                type: table.type,
                columns: []
            };

            // 3. Get columns for this table
            try {
                const colsRes = await fetch(`${BASE_URL}/api/v2/meta/tables/${table.id}/columns`, { headers });
                const colsData = await colsRes.json();
                const columns = (colsData as any).list || [];

                console.log(`  │  Columns: ${columns.length}\n`);
                console.log(`  ├─ COLUMNS:`);

                for (const col of columns) {
                    const colInfo = {
                        id: col.id,
                        title: col.title,
                        column_name: col.column_name,
                        uidt: col.uidt,
                        dt: col.dt,
                        pk: col.pk,
                        ai: col.ai,
                        rqd: col.rqd,
                        system: col.system
                    };

                    tableSchema.columns.push(colInfo);

                    const flags = [
                        col.pk ? '🔑PK' : '',
                        col.ai ? '🔢AI' : '',
                        col.rqd ? '⚠️REQ' : '',
                        col.system ? '🔒SYS' : ''
                    ].filter(Boolean).join(' ');

                    const name = col.title.padEnd(35);
                    const type = (col.uidt || col.dt || '?').padEnd(20);
                    const colName = col.column_name.padEnd(30);

                    console.log(`  │   ${name} │ ${type} │ ${colName} │ ${flags}`);
                }

                // Try to get row count (sample query)
                try {
                    const countRes = await fetch(
                        `${BASE_URL}/api/v2/tables/${table.id}/records?limit=1&offset=0`,
                        { headers }
                    );
                    const countData = await countRes.json();
                    const pageInfo = (countData as any).pageInfo;
                    if (pageInfo) {
                        console.log(`  │`);
                        console.log(`  └─ 📊 Total Rows: ${pageInfo.totalRows || 0}`);
                        tableSchema.rowCount = pageInfo.totalRows;
                    }
                } catch (e) {
                    console.log(`  │`);
                    console.log(`  └─ 📊 Row count unavailable`);
                }

            } catch (error) {
                console.log(`  └─ ⚠️  Could not fetch columns: ${(error as Error).message}`);
            }

            schemas[base.title].tables.push(tableSchema);
            console.log('');
        }
    }

    return schemas;
}

async function main() {
    try {
        const schemas = await exploreNocoDB();

        // Save to file
        const fs = await import('fs');
        fs.writeFileSync('nocodb-full-schema.json', JSON.stringify(schemas, null, 2));
        console.log('\n✅ Full schema saved to: nocodb-full-schema.json\n');

        // Summary
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        for (const [baseName, baseData] of Object.entries(schemas) as any) {
            const totalColumns = baseData.tables.reduce((sum: number, t: any) => sum + t.columns.length, 0);
            console.log(`📦 ${baseName}:`);
            console.log(`   Tables: ${baseData.tables.length}`);
            console.log(`   Total Columns: ${totalColumns}`);

            if (baseData.tables.length > 0) {
                console.log(`   Tables:`);
                for (const table of baseData.tables) {
                    console.log(`     • ${table.title} (${table.columns.length} cols${table.rowCount ? `, ${table.rowCount} rows` : ''})`);
                }
            }
            console.log('');
        }

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

main();
