/**
 * Single Item Migration Script V2
 *
 * Improved with:
 * - Correct field mapping (SKU as array, PriceVATDE, etc.)
 * - Better ListingFeed title
 * - Extract product type for Parts New name (e.g., "Daumengas")
 * - Vehicle variant search and linking
 */

import { SeaTableClient } from './src/lib/biz/seatable.js';
import { NocoDBClient } from './src/lib/biz/nocodb/index.js';
import { NocoDBPostgresClient } from './src/lib/biz/nocodb/postgres.js';

// Helper: Extract product type from title (e.g., "Daumengas" from "Ninebot Max G30 Daumengas...")
function extractProductType(title: string): string {
    // Common product types in e-scooter parts
    const productTypes = [
        'Daumengas', 'Gashebel', 'Bremsscheibe', 'Bremshebel', 'Reifen', 'Schlauch',
        'Kotflügel', 'Lenkstange', 'Vorderrad', 'Hinterrad', 'Controller', 'Display',
        'Akku', 'Ladegerät', 'Kabel', 'Schrauben', 'Ventil', 'Bremssattel',
        'Trittbrett', 'Lenkerkopf', 'Displayhalterung', 'Vorderradgabel'
    ];

    for (const type of productTypes) {
        if (title.includes(type)) {
            return type;
        }
    }

    // Fallback: use first 3 words
    const words = title.split(' ').slice(0, 3);
    return words.join(' ');
}

// Helper: Generate nice ListingFeed title
function generateListingTitle(originalTitle: string): string {
    // Remove common suffixes
    let cleanTitle = originalTitle
        .replace(/Aftermarket/gi, '')
        .replace(/Ersatz/gi, '')
        .replace(/Original/gi, '')
        .replace(/OEM/gi, '')
        .replace(/Neu/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Limit to 78 characters (eBay limit)
    if (cleanTitle.length > 78) {
        cleanTitle = cleanTitle.substring(0, 75) + '...';
    }

    return cleanTitle;
}

// Helper: Search for vehicle variant by name
async function findVehicleVariant(nocodb: NocoDBClient, vehicleName: string): Promise<number[]> {
    try {
        // Extract model key (e.g., "G30" from "Ninebot G-30 Serie", "F-Serie" from "Ninebot F-Serie")
        const modelMatch = vehicleName.match(/([A-Z]\d+|[A-Z]-\d+|[A-Z]-Serie)/i);
        const searchTerm = modelMatch ? modelMatch[1].replace('-', '') : vehicleName;

        console.log(`         Searching for: "${searchTerm}" (from "${vehicleName}")`);

        // Search in VehicleModelsVariants table using VariantName field
        const results = await nocodb.records.list('Product Data Management', 'VehicleModelsVariants', {
            where: `(VariantName,like,%${searchTerm}%)`,
            limit: 20
        });

        if (results.list && results.list.length > 0) {
            console.log(`         ✓ Found ${results.list.length} matching variants:`);
            const ids: number[] = [];

            // Return ALL matching variants (up to 5)
            for (const variant of results.list.slice(0, 5)) {
                console.log(`            - ID ${variant.Id}: ${variant.VariantName}`);
                ids.push(variant.Id);
            }

            return ids;
        }

        return [];
    } catch (error) {
        console.log(`      ⚠️  Could not search for vehicle: ${error}`);
        return [];
    }
}

async function migrateSingleItem(sku: string): Promise<void> {
    console.log('═'.repeat(70));
    console.log(`MIGRATING SKU: ${sku}`);
    console.log('═'.repeat(70));
    console.log('');

    // Initialize clients
    const seatable = SeaTableClient.fromConfig();
    const nocodb = NocoDBClient.fromConfig();
    const postgres = new NocoDBPostgresClient(
        'postgresql://postgres:lNUFxzyI-oiKM-57WTUIeB@157.90.228.240:15432/noco_db'
    );

    try {
        // Step 1: Fetch from SeaTable
        console.log('📦 Step 1: Fetching eBay Listing from SeaTable...');
        const allEbayListings = await seatable.listRows({
            table_name: 'eBay Listings',
            limit: 200
        });

        const ebayListings = allEbayListings.filter((listing: any) =>
            (listing.SKU === sku) || (listing['0000'] === sku)
        );

        if (ebayListings.length === 0) {
            throw new Error(`eBay Listing with SKU ${sku} not found`);
        }

        const listing = ebayListings[0];
        console.log(`   ✓ Found: ${listing.Title || listing['4cdo']}`);
        console.log(`   Price: €${listing.Price || listing['4VVt']}`);
        console.log('');

        // Step 2: Check if exists
        console.log('🔍 Step 2: Checking if already exists...');
        const existing = await nocodb.records.find('Product Data Management', 'eBayFeed', 'SKU', sku);
        if (existing.length > 0) {
            console.log(`   ⚠️  Already exists (ID: ${existing[0].Id}), skipping`);
            return;
        }
        console.log('   ✓ Does not exist, proceeding');
        console.log('');

        // Step 3: Create eBayFeed with CORRECT mapping
        console.log('📝 Step 3: Creating eBayFeed entry...');

        const ebayFeedData = {
            SKU: [listing.SKU || listing['0000']], // ⚠️ ARRAY!
            Title: listing.Title || listing['4cdo'],
            SourceID: listing.SourceID || listing['Jizb'],
            DescriptionHTML: listing['Description HTML'] || listing['fm58'],
            'eBay Category': listing['ebay Category'] || listing['lyju'],
            PriceVATDE: listing.Price || listing['4VVt'],
            ConditionID: listing.ConditionID || listing['9FZO'] || '1000',
            VAT: listing.VAT || listing['SnJH'] || 19,
            // Image: Parse PictureURLs if available
            Seller: 'escootervision',
            UnitsRequired: 1
        };

        const ebayFeed = await nocodb.records.create('Product Data Management', 'eBayFeed', ebayFeedData);
        console.log(`   ✓ Created eBayFeed (ID: ${ebayFeed.Id})`);
        console.log('');

        // Step 4: Create ListingFeed with nice title
        console.log('📝 Step 4: Creating ListingFeed...');

        const niceTitle = generateListingTitle(listing.Title || listing['4cdo']);
        const listingFeedData = {
            Title: niceTitle,
            Status: 'Draft',
            PriceWithVatDE: listing.Price || listing['4VVt'],
            Condition: 'New',
            Seller: 'escootervision'
        };

        const listingFeed = await nocodb.records.create('Product Data Management', 'ListingFeed', listingFeedData);
        console.log(`   ✓ Created ListingFeed (ID: ${listingFeed.Id})`);
        console.log(`   Title: "${niceTitle}"`);
        console.log('');

        // Step 5: Parse vehicles
        console.log('🚗 Step 5: Parsing vehicle compatibility...');
        const compatibleText = listing['Compatible with'] || listing['Oc8R'] || '';
        const vehicleNames = compatibleText
            .split(',')
            .map((name: string) => name.trim())
            .filter((name: string) => name.length > 0);

        console.log(`   Found ${vehicleNames.length} vehicles: ${vehicleNames.join(', ')}`);
        console.log('');

        // Step 6: Create Parts New entries
        console.log('🔧 Step 6: Creating Parts New entries...');

        const productType = extractProductType(listing.Title || listing['4cdo']);
        console.log(`   Product type extracted: "${productType}"`);
        console.log('');

        for (const vehicleName of vehicleNames) {
            console.log(`   Processing vehicle: ${vehicleName}`);

            // Search for vehicle variants
            console.log(`      🔍 Searching for vehicle variants...`);
            const vehicleVariantIds = await findVehicleVariant(nocodb, vehicleName);

            if (vehicleVariantIds.length === 0) {
                console.log(`         ⚠️  No vehicle variants found - skipping`);
                console.log('');
                continue;
            }

            // Create ONE Parts New entry for all variants of this vehicle series
            const partsNewData = {
                Title: productType, // ⚠️ Short name!
                Type: 'Aftermarket',
                Ready: false
            };

            const partsNew = await nocodb.records.create('Product Data Management', 'Parts New', partsNewData);
            console.log(`      ✓ Created Parts New (ID: ${partsNew.Id}, Name: "${productType}")`);

            // Link Parts ↔ ListingFeed
            console.log(`      🔗 Linking Parts ${partsNew.Id} ↔ ListingFeed ${listingFeed.Id}...`);
            await postgres.linkPartsToListingFeed(partsNew.Id, listingFeed.Id);
            console.log(`         ✓ Linked via SQL`);

            // Link Parts ↔ ALL Vehicle Variants found
            console.log(`      🔗 Linking Parts ${partsNew.Id} to ${vehicleVariantIds.length} vehicle variants...`);
            for (const vehicleVariantId of vehicleVariantIds) {
                await postgres.linkPartsToVehicle(partsNew.Id, vehicleVariantId);
            }
            console.log(`         ✓ Linked to all ${vehicleVariantIds.length} variants via SQL`);

            console.log('');
        }

        // Cleanup
        await postgres.close();

        console.log('✅ Migration completed successfully!');
        console.log('');

    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        await postgres.close();
        throw error;
    }
}

// Main
async function main() {
    const testSKU = 'NG0005';

    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  Single Item Migration V2                 ║');
    console.log('╚════════════════════════════════════════════╝\n');

    await migrateSingleItem(testSKU);

    console.log('═'.repeat(70));
    console.log('DONE');
    console.log('═'.repeat(70));
}

main().catch(error => {
    console.error('Fatal:', error);
    process.exit(1);
});
