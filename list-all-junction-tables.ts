import { NocoDBPostgresClient } from './src/lib/biz/nocodb/postgres.js';

async function main() {
    const client = new NocoDBPostgresClient(
        'postgresql://postgres:lNUFxzyI-oiKM-57WTUIeB@157.90.228.240:15432/noco_db'
    );

    console.log('All Junction Tables in Product Data Management:\n');

    const result = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'pobn8zbs31sbv00'
        AND table_name LIKE '_nc_m2m_%'
        ORDER BY table_name;
    `);

    result.rows.forEach((row: any, index: number) => {
        console.log(`${index + 1}. ${row.table_name}`);
    });

    console.log(`\nTotal: ${result.rows.length} junction tables`);

    await client.close();
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
