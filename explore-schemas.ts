/**
 * Schema Explorer for NocoDB and SeaTable
 *
 * Fetches and displays complete database schemas
 */

import { NocoDBClient } from './src/lib/biz/nocodb/index.js';
import { SeaTableClient } from './src/lib/biz/seatable.js';
import { writeFileSync } from 'fs';

interface TableSchema {
    name: string;
    columns: Array<{
        name: string;
        type: string;
        key?: string;
        nullable?: boolean;
        default?: any;
    }>;
    rowCount?: number;
}

async function exploreNocoDB() {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  NocoDB Schema Explorer                    ║');
    console.log('╚════════════════════════════════════════════╝\n');

    const client = NocoDBClient.fromConfig();
    const schemas: Record<string, TableSchema[]> = {};

    try {
        // Get all bases
        const basesResponse = await client.rawApi.base.list();
        const bases = (basesResponse as any).list || [];

        console.log(`Found ${bases.length} bases/projects\n`);

        for (const base of bases) {
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`📦 Base: ${base.title} (${base.id})`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

            schemas[base.title] = [];

            try {
                // Get tables for this base
                const tablesResponse = await client.rawApi.dbTable.list(base.id);
                const tables = (tablesResponse as any).list || [];

                console.log(`   Found ${tables.length} tables:\n`);

                for (const table of tables) {
                    console.log(`   📋 Table: ${table.title}`);

                    const tableSchema: TableSchema = {
                        name: table.title,
                        columns: []
                    };

                    // Get columns
                    const columnsResponse = await client.rawApi.dbTableColumn.list(table.id);
                    const columns = (columnsResponse as any).list || [];

                    console.log(`      Columns (${columns.length}):`);

                    for (const col of columns) {
                        const colInfo = {
                            name: col.title,
                            type: col.uidt || col.dt || 'unknown',
                            key: col.column_name,
                            nullable: !col.rqd,
                            default: col.cdf
                        };

                        tableSchema.columns.push(colInfo);

                        const typeDisplay = `${col.uidt || col.dt}`.padEnd(20);
                        const nameDisplay = col.title.padEnd(30);
                        const keyDisplay = col.pk ? '🔑 PK' : col.ai ? '🔢 AI' : '';

                        console.log(`         ${nameDisplay} │ ${typeDisplay} │ ${keyDisplay}`);
                    }

                    // Try to get row count
                    try {
                        const countResponse = await client.records.list(base.id, table.title, { limit: 1 });
                        if (countResponse.pageInfo) {
                            tableSchema.rowCount = (countResponse.pageInfo as any).totalRows || 0;
                            console.log(`      📊 Rows: ${tableSchema.rowCount}`);
                        }
                    } catch (error) {
                        console.log(`      📊 Rows: (unable to fetch)`);
                    }

                    schemas[base.title].push(tableSchema);
                    console.log('');
                }

            } catch (error) {
                console.log(`   ⚠️  Could not fetch tables: ${(error as Error).message}\n`);
            }
        }

        return schemas;

    } catch (error) {
        console.error('❌ Error exploring NocoDB:', (error as Error).message);
        throw error;
    }
}

async function exploreSeaTable() {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  SeaTable Schema Explorer                  ║');
    console.log('╚════════════════════════════════════════════╝\n');

    const client = SeaTableClient.fromConfig();
    const schemas: TableSchema[] = [];

    try {
        const metadata = await client.getMetadata();

        console.log(`Found ${metadata.tables.length} tables\n`);

        for (const table of metadata.tables) {
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`📋 Table: ${table.name} (${table._id})`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

            const tableSchema: TableSchema = {
                name: table.name,
                columns: []
            };

            console.log(`   Columns (${table.columns.length}):`);

            for (const col of table.columns) {
                const colInfo = {
                    name: col.name,
                    type: col.type,
                    key: col.key
                };

                tableSchema.columns.push(colInfo);

                const typeDisplay = `${col.type}`.padEnd(20);
                const nameDisplay = col.name.padEnd(30);
                const keyDisplay = col.key.padEnd(10);

                // Add extra info for specific column types
                let extraInfo = '';
                if (col.data) {
                    const data = col.data as any;
                    if (data.table_id) {
                        extraInfo = `→ Links to table`;
                    } else if (data.options) {
                        extraInfo = `Options: ${data.options.length}`;
                    } else if (data.format) {
                        extraInfo = `Format: ${data.format}`;
                    }
                }

                console.log(`      ${nameDisplay} │ ${typeDisplay} │ ${keyDisplay} │ ${extraInfo}`);
            }

            // Get row count
            try {
                const rows = await client.listRows({
                    table_name: table.name,
                    limit: 1
                });

                // SeaTable doesn't return total count in basic list, so we'll just note if there are rows
                tableSchema.rowCount = rows.length > 0 ? -1 : 0; // -1 means "has rows, count unknown"
                console.log(`   📊 Has data: ${rows.length > 0 ? 'Yes' : 'No'}`);
            } catch (error) {
                console.log(`   📊 Rows: (unable to fetch)`);
            }

            schemas.push(tableSchema);
            console.log('');
        }

        return schemas;

    } catch (error) {
        console.error('❌ Error exploring SeaTable:', (error as Error).message);
        throw error;
    }
}

async function main() {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  Database Schema Explorer                  ║');
    console.log('║  NocoDB + SeaTable                         ║');
    console.log('╚════════════════════════════════════════════╝');

    const results = {
        nocodb: {} as Record<string, TableSchema[]>,
        seatable: [] as TableSchema[]
    };

    try {
        results.nocodb = await exploreNocoDB();
        results.seatable = await exploreSeaTable();

        // Save to JSON files
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('💾 Saving schemas to files...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        writeFileSync('nocodb-schema.json', JSON.stringify(results.nocodb, null, 2));
        writeFileSync('seatable-schema.json', JSON.stringify(results.seatable, null, 2));

        console.log('✓ NocoDB schema saved to: nocodb-schema.json');
        console.log('✓ SeaTable schema saved to: seatable-schema.json');
        console.log('');

        // Summary
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 Summary');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        const nocodbBases = Object.keys(results.nocodb);
        const nocodbTables = Object.values(results.nocodb).flat();
        const nocodbColumns = nocodbTables.reduce((sum, t) => sum + t.columns.length, 0);

        console.log('NocoDB:');
        console.log(`  Bases:   ${nocodbBases.length}`);
        console.log(`  Tables:  ${nocodbTables.length}`);
        console.log(`  Columns: ${nocodbColumns}`);
        console.log('');

        const seatableColumns = results.seatable.reduce((sum, t) => sum + t.columns.length, 0);
        console.log('SeaTable:');
        console.log(`  Tables:  ${results.seatable.length}`);
        console.log(`  Columns: ${seatableColumns}`);
        console.log('');

        // Interesting findings
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔍 Key Findings');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Find Product Data Management base
        const pdmBase = results.nocodb['Product Data Management'];
        if (pdmBase) {
            console.log('📦 Product Data Management (NocoDB):');
            for (const table of pdmBase) {
                console.log(`   • ${table.name} (${table.columns.length} columns)`);
            }
            console.log('');
        }

        // Find SupplyChain base
        const scBase = results.nocodb['SupplyChain'];
        if (scBase) {
            console.log('📦 SupplyChain (NocoDB):');
            for (const table of scBase) {
                console.log(`   • ${table.name} (${table.columns.length} columns)`);
            }
            console.log('');
        }

        // SeaTable tables
        console.log('📊 SeaTable Tables:');
        for (const table of results.seatable) {
            console.log(`   • ${table.name} (${table.columns.length} columns)`);
        }
        console.log('');

    } catch (error) {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    }
}

main();
