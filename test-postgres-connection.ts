import { NocoDBPostgresClient } from './src/lib/biz/nocodb/postgres.js';

async function main() {
    console.log('Testing Postgres connections...\n');

    const password = 'lNUFxzyI-oiKM-57WTUIeB';
    const connections = [
        {
            name: 'Public IP',
            url: `postgresql://postgres:${password}@157.90.228.240:15432/noco_db`
        },
        {
            name: 'Private IP',
            url: `postgresql://postgres:${password}@10.41.9.3:15432/noco_db`
        }
    ];

    for (const conn of connections) {
        console.log(`Testing ${conn.name}...`);
        const client = new NocoDBPostgresClient(conn.url);

        try {
            const connected = await client.testConnection();
            if (connected) {
                console.log(`✅ ${conn.name} works!`);

                // Try to query junction tables
                const result = await client.query(`
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'pobn8zbs31sbv00'
                    AND table_name LIKE '_nc_m2m_%'
                    LIMIT 5;
                `);

                console.log(`   Found ${result.rows.length} junction tables:`);
                result.rows.forEach((row: any) => {
                    console.log(`   - ${row.table_name}`);
                });
            } else {
                console.log(`❌ ${conn.name} failed`);
            }
        } catch (error: any) {
            console.log(`❌ ${conn.name} error: ${error.message}`);
        } finally {
            await client.close();
        }
        console.log('');
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
