import { SeaTableClient } from './src/lib/biz/seatable.js';

async function main() {
    const seatable = SeaTableClient.fromConfig();
    const listings = await seatable.listRows({ table_name: 'eBay Listings', limit: 100 });
    const ng = listings.find((l: any) => l.SKU === 'NG0005');
    console.log(JSON.stringify(ng, null, 2));
}

main();
