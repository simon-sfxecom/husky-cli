/**
 * Single Item Migration Script
 *
 * Migrates ONE SKU from SeaTable → NocoDB
 * Test with: NG0005 (Ninebot Max G30 Gashebel)
 */

import { SeaTableClient } from './src/lib/biz/seatable.js';
import { NocoDBClient } from './src/lib/biz/nocodb/index.js';
import { NocoDBPostgresClient } from './src/lib/biz/nocodb/postgres.js';

interface MigrationResult {
    success: boolean;
    sku: string;
    ebayFeedId?: number;
    shopifyFeedId?: number;
    listingFeedId?: number;
    partsNewIds?: number[];
    errors?: string[];
}

async function migrateSingleItem(sku: string, shopifySku?: string): Promise<MigrationResult> {
    const result: MigrationResult = {
        success: false,
        sku,
        errors: []
    };

    console.log('═'.repeat(70));
    console.log(`MIGRATING SKU: ${sku}`);
    console.log('═'.repeat(70));
    console.log('');

    try {
        // Initialize clients
        const seatable = SeaTableClient.fromConfig();
        const nocodb = NocoDBClient.fromConfig();
        const postgres = new NocoDBPostgresClient(
            'postgresql://postgres:lNUFxzyI-oiKM-57WTUIeB@157.90.228.240:15432/noco_db'
        );

        // Step 1: Fetch eBay Listing from SeaTable
        console.log('📦 Step 1: Fetching eBay Listing from SeaTable...');
        const allEbayListings = await seatable.listRows({
            table_name: 'eBay Listings',
            limit: 100
        });
        const ebayListings = allEbayListings.filter((listing: any) =>
            (listing.SKU === sku) || (listing['0000'] === sku)
        );

        if (ebayListings.length === 0) {
            throw new Error(`eBay Listing with SKU ${sku} not found in SeaTable`);
        }

        const ebayListing = ebayListings[0];
        console.log(`   ✓ Found: ${ebayListing.Title || ebayListing['4cdo']}`);
        console.log(`   Price: €${ebayListing.Price || ebayListing['4VVt']}`);
        console.log(`   Compatible with: ${ebayListing['Compatible with'] || ebayListing['Oc8R'] || 'N/A'}`);
        console.log('');

        // Step 2: Check if already exists in NocoDB
        console.log('🔍 Step 2: Checking if SKU already exists in NocoDB...');
        const existing = await nocodb.records.find('Product Data Management', 'eBayFeed', 'SKU', sku);
        if (existing.length > 0) {
            console.log(`   ⚠️  SKU ${sku} already exists in eBayFeed (ID: ${existing[0].Id})`);
            console.log(`   Skipping migration.`);
            result.ebayFeedId = existing[0].Id;
            return result;
        }
        console.log(`   ✓ SKU does not exist - proceeding with migration`);
        console.log('');

        // Step 3: Create eBayFeed entry
        console.log('📝 Step 3: Creating eBayFeed entry...');
        const ebayFeedData = {
            SKU: ebayListing.SKU || ebayListing['0000'],
            Title: ebayListing.Title || ebayListing['4cdo'],
            Price: ebayListing.Price || ebayListing['4VVt'],
            GTIN: ebayListing.GTIN || ebayListing['q69Y'],
            eBayItemID: ebayListing.SourceID || ebayListing['Jizb'],
            Brand: ebayListing.Marke || ebayListing['s93I'],
            ProductType: ebayListing.Produkart || ebayListing['yYid'],
            ManufacturerPartNumber: ebayListing.Herstellernummer || ebayListing['8dUN'],
            DescriptionHTML: ebayListing['Description HTML'] || ebayListing['fm58'],
            PictureURLs: ebayListing.PictureURLs || ebayListing['Y9sn'],
            ConditionID: ebayListing.ConditionID || ebayListing['9FZO'],
            eBayCategory: ebayListing['ebay Category'] || ebayListing['lyju'],
            PriceNet: ebayListing.PriceNet || ebayListing['iwLg'],
            VAT: ebayListing.VAT || ebayListing['SnJH'],
            BuyInPrice: ebayListing.BuyInPrice || ebayListing['g9j9'],
            IsLive: ebayListing.IsLive || ebayListing['399d'],
            CompatibleWithText: ebayListing['Compatible with'] || ebayListing['Oc8R'],
            HasCompatibleList: ebayListing.CompatibleList || ebayListing['e93x'] || false,
            MigratedFrom: 'SeaTable',
            MigrationDate: new Date().toISOString(),
            SeaTableID: ebayListing._id
        };

        const ebayFeed = await nocodb.records.create('Product Data Management', 'eBayFeed', ebayFeedData);
        result.ebayFeedId = ebayFeed.Id;
        console.log(`   ✓ Created eBayFeed entry (ID: ${ebayFeed.Id})`);
        console.log('');

        // Step 4: Create ShopifyFeed entry (if matched)
        if (shopifySku) {
            console.log(`📝 Step 4: Creating ShopifyFeed entry for ${shopifySku}...`);
            const allShopifyListings = await seatable.listRows({
                table_name: 'Shopify Listings',
                limit: 100
            });
            const shopifyListings = allShopifyListings.filter((listing: any) =>
                (listing.sku === shopifySku) || (listing['0000'] === shopifySku)
            );

            if (shopifyListings.length > 0) {
                const shopifyListing = shopifyListings[0];
                const shopifyFeedData = {
                    SKU: shopifyListing.sku || shopifyListing['0000'],
                    Title: shopifyListing.title,
                    Price: shopifyListing.price,
                    // Add more Shopify fields as needed
                };

                const shopifyFeed = await nocodb.records.create('Product Data Management', 'ShopifyFeed', shopifyFeedData);
                result.shopifyFeedId = shopifyFeed.Id;
                console.log(`   ✓ Created ShopifyFeed entry (ID: ${shopifyFeed.Id})`);
            } else {
                console.log(`   ⚠️  Shopify SKU ${shopifySku} not found in SeaTable`);
            }
            console.log('');
        } else {
            console.log(`⏭️  Step 4: Skipped (no Shopify match)`);
            console.log('');
        }

        // Step 5: Create ListingFeed entry
        console.log('📝 Step 5: Creating ListingFeed entry...');
        const listingFeedData = {
            Title: ebayListing.Title || ebayListing['4cdo'],
            Status: 'Draft',
            PriceWithVatDE: ebayListing.Price || ebayListing['4VVt'],
            Condition: 'New',
            Seller: 'escootervision'
        };

        const listingFeed = await nocodb.records.create('Product Data Management', 'ListingFeed', listingFeedData);
        result.listingFeedId = listingFeed.Id;
        console.log(`   ✓ Created ListingFeed entry (ID: ${listingFeed.Id})`);
        console.log('');

        // Step 6: Link eBayFeed ↔ ListingFeed via Junction Table (SQL)
        console.log('🔗 Step 6: Linking eBayFeed to ListingFeed via SQL...');
        // Note: Need to find the correct junction table for this
        console.log(`   ⏭️  Skipped for now - need to verify junction table structure`);
        console.log('');

        // Step 7: Handle Vehicles
        console.log('🚗 Step 7: Parsing vehicle compatibility...');
        const compatibleText = ebayListing['Compatible with'] || ebayListing['Oc8R'] || '';
        console.log(`   Raw text: "${compatibleText}"`);

        const vehicleNames = compatibleText
            .split(',')
            .map((name: string) => name.trim())
            .filter((name: string) => name.length > 0);

        console.log(`   Found ${vehicleNames.length} vehicles:`);
        vehicleNames.forEach((name: string) => console.log(`      - ${name}`));
        console.log('');

        // Step 8: Create Parts New entries (one per vehicle)
        console.log('🔧 Step 8: Creating Parts New entries...');
        result.partsNewIds = [];

        for (const vehicleName of vehicleNames) {
            console.log(`   Creating Parts New for: ${vehicleName}`);

            const partsNewData = {
                Title: ebayListing.Title || ebayListing['4cdo'],
                Type: 'Aftermarket', // Default - could be parsed from title
                // MountingPosition: parsed later if needed
                Ready: false
            };

            const partsNew = await nocodb.records.create('Product Data Management', 'Parts New', partsNewData);
            result.partsNewIds.push(partsNew.Id);
            console.log(`      ✓ Created Parts New (ID: ${partsNew.Id})`);

            // Link Parts New ↔ ListingFeed
            console.log(`      🔗 Linking Parts New ${partsNew.Id} ↔ ListingFeed ${listingFeed.Id}...`);
            await postgres.linkPartsToListingFeed(partsNew.Id, listingFeed.Id);
            console.log(`         ✓ Linked via SQL`);

            // TODO: Find VehicleVariant ID and link
            console.log(`      ⏭️  Skipping vehicle link (need to implement vehicle search)`);
        }
        console.log('');

        // Cleanup
        await postgres.close();

        result.success = true;
        console.log('✅ Migration completed successfully!');
        console.log('');

    } catch (error: any) {
        result.errors?.push(error.message);
        console.error('❌ Migration failed:', error.message);
        console.log('');
    }

    return result;
}

// Main execution
async function main() {
    const testSKU = 'NG0005';  // Ninebot Max G30 Gashebel
    const shopifyMatch = undefined; // No Shopify match for this test

    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  Single Item Migration Test               ║');
    console.log('╚════════════════════════════════════════════╝\n');

    const result = await migrateSingleItem(testSKU, shopifyMatch);

    console.log('═'.repeat(70));
    console.log('MIGRATION SUMMARY');
    console.log('═'.repeat(70));
    console.log(`SKU: ${result.sku}`);
    console.log(`Success: ${result.success ? '✅' : '❌'}`);
    console.log(`eBayFeed ID: ${result.ebayFeedId || 'N/A'}`);
    console.log(`ShopifyFeed ID: ${result.shopifyFeedId || 'N/A'}`);
    console.log(`ListingFeed ID: ${result.listingFeedId || 'N/A'}`);
    console.log(`Parts New IDs: ${result.partsNewIds?.join(', ') || 'N/A'}`);
    if (result.errors && result.errors.length > 0) {
        console.log(`Errors: ${result.errors.join('; ')}`);
    }
    console.log('═'.repeat(70));
    console.log('');
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
