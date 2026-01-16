/**
 * Concrete Migration Example
 *
 * Shows exactly what data goes where in NocoDB
 */

import { SeaTableClient } from './src/lib/biz/seatable.js';
import { writeFileSync } from 'fs';

async function main() {
    const seatable = SeaTableClient.fromConfig();

    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  Concrete Migration Example                ║');
    console.log('║  1 eBay Listing → NocoDB Tables            ║');
    console.log('╚════════════════════════════════════════════╝\n');

    // 1. Get ONE eBay Listing with data
    console.log('📦 Step 1: Fetching eBay Listing from SeaTable...\n');

    const listings = await seatable.listRows({
        table_name: 'eBay Listings',
        limit: 5 // Get 5 to find one with compatible data
    });

    let listing: any = null;
    let compatibleRecords: any[] = [];

    // Find a listing that has Compatible link data
    for (const l of listings) {
        if (l.Compatible && Array.isArray(l.Compatible) && l.Compatible.length > 0) {
            listing = l;
            console.log(`✓ Found listing with Compatible data: ${l.SKU}\n`);
            break;
        }
    }

    // If no linked data, use first one anyway
    if (!listing) {
        listing = listings[0];
        console.log(`⚠️ No listing with Compatible link found, using: ${listing.SKU}\n`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 SOURCE DATA (SeaTable)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('eBay Listing:');
    console.log(`   SKU:                ${listing.SKU || listing['0000']}`);
    console.log(`   Title:              ${listing.Title || listing['4cdo']}`);
    console.log(`   Price:              €${listing.Price || listing['4VVt']}`);
    console.log(`   GTIN:               ${listing.GTIN || listing['q69Y']}`);
    console.log(`   SourceID (eBay):    ${listing.SourceID || listing['Jizb']}`);
    console.log(`   Compatible with:    ${listing['Compatible with'] || listing['Oc8R'] || 'N/A'}`);
    console.log(`   CompatibleList:     ${listing.CompatibleList || listing['e93x'] ? 'Yes' : 'No'}`);
    console.log(`   Compatible Link:    ${listing.Compatible || listing['Ir9j'] ? JSON.stringify(listing.Compatible || listing['Ir9j']) : '[]'}`);
    console.log('');

    // 2. Try to get Compatible records if linked
    if (listing.Compatible && Array.isArray(listing.Compatible) && listing.Compatible.length > 0) {
        console.log('🔗 Step 2: Following Compatible link...\n');

        for (const compatId of listing.Compatible) {
            try {
                const compatRow = await seatable.searchRows('Compatible', compatId);
                if (compatRow.length > 0) {
                    compatibleRecords.push(compatRow[0]);
                    console.log(`   ✓ Found Compatible record: ${compatRow[0].Name || compatRow[0]['0000']}`);
                }
            } catch (error) {
                console.log(`   ✗ Could not fetch Compatible ${compatId}`);
            }
        }
        console.log('');
    } else {
        console.log('⚠️ Step 2: No Compatible link data - will use TEXT field\n');
    }

    // 3. Get VehicleModels if we have compatible records
    const vehicleModels: any[] = [];
    if (compatibleRecords.length > 0) {
        console.log('🚗 Step 3: Following VehicleModels link...\n');

        for (const compat of compatibleRecords) {
            const vehicleLinks = compat.VehicleModels || compat['08bi'];
            if (vehicleLinks && Array.isArray(vehicleLinks)) {
                for (const vmId of vehicleLinks) {
                    try {
                        const vm = await seatable.searchRows('VehicleModels', vmId);
                        if (vm.length > 0) {
                            vehicleModels.push(vm[0]);
                            console.log(`   ✓ Vehicle: ${vm[0].Name || vm[0]['0000']}`);
                        }
                    } catch (error) {
                        console.log(`   ✗ Could not fetch VehicleModel ${vmId}`);
                    }
                }
            }
        }
        console.log('');
    }

    // 4. Now show what goes into NocoDB
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 NOCODB MIGRATION TARGET');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Table 1: eBayFeed
    console.log('┌─────────────────────────────────────────────┐');
    console.log('│ TABLE 1: eBayFeed                           │');
    console.log('│ (Product Data Management Base)              │');
    console.log('└─────────────────────────────────────────────┘\n');

    const ebayFeedEntry = {
        sku: listing.SKU || listing['0000'],
        title: listing.Title || listing['4cdo'],
        price: listing.Price || listing['4VVt'],
        gtin: listing.GTIN || listing['q69Y'],
        ebay_item_id: listing.SourceID || listing['Jizb'],
        description_html: listing['Description HTML'] || listing['fm58'],
        ebay_category: listing['ebay Category'] || listing['lyju'],
        condition_id: listing.ConditionID || listing['9FZO'],
        brand: listing.Marke || listing['s93I'],
        product_type: listing.Produkart || listing['yYid'],
        manufacturer_part_number: listing.Herstellernummer || listing['8dUN'],
        price_net: listing.PriceNet || listing['iwLg'],
        vat: listing.VAT || listing['SnJH'],
        buy_in_price: listing.BuyInPrice || listing['g9j9'],
        raw_margin: listing.RawMargin || listing['NE1G'],
        raw_margin_percentage: listing.RawMarginPercentage || listing['f37D'],
        is_live: listing.IsLive || listing['399d'],
        picture_urls: listing.PictureURLs || listing['Y9sn'],

        // Compatible info
        compatible_with_text: listing['Compatible with'] || listing['Oc8R'], // Original TEXT
        has_compatible_list: listing.CompatibleList || listing['e93x'] || false,

        // Migration metadata
        migrated_from: 'SeaTable',
        migration_date: new Date().toISOString(),
        seatable_id: listing._id
    };

    console.log('INSERT INTO eBayFeed:');
    console.log(JSON.stringify(ebayFeedEntry, null, 2));
    console.log('');

    // Table 2: VehicleModelSources (if we have vehicle data)
    if (vehicleModels.length > 0) {
        console.log('\n┌─────────────────────────────────────────────┐');
        console.log('│ TABLE 2: VehicleModelSources                │');
        console.log('│ (Product Data Management Base)              │');
        console.log('└─────────────────────────────────────────────┘\n');

        for (const vm of vehicleModels) {
            const vehicleEntry = {
                name: vm.Name || vm['0000'],
                abe_nr: vm['ABE-Nr'] || vm['71No'],
                tire_size: vm['Tire Size'] || vm['vJ50'],
                brake_type: vm.BrakeType || vm['LwaT'],
                brake_disc_front: vm.BrakeDiscFront || vm['RBE0'],
                brake_disc_rear: vm.BrakeDiscRear || vm['3OjP'],
                is_tubeless: vm['IsTubeless?'] || vm['90B8'],
                inner_tube_sizes: vm.InnerTubeSizes || vm['P8fU'],

                // Migration metadata
                seatable_id: vm._id,
                migrated_from: 'SeaTable'
            };

            console.log('INSERT INTO VehicleModelSources:');
            console.log(JSON.stringify(vehicleEntry, null, 2));
            console.log('');
        }
    }

    // Table 3: Junction Table (eBayFeed_VehicleModels)
    if (vehicleModels.length > 0) {
        console.log('\n┌─────────────────────────────────────────────┐');
        console.log('│ TABLE 3: eBayFeed_VehicleModels (Junction) │');
        console.log('│ OPTION: Create this if you want relations  │');
        console.log('└─────────────────────────────────────────────┘\n');

        for (const vm of vehicleModels) {
            const junction = {
                ebay_feed_sku: listing.SKU || listing['0000'],
                vehicle_model_name: vm.Name || vm['0000'],
                source: 'Compatible_Link', // or 'Text_Field'
                created_at: new Date().toISOString()
            };

            console.log('INSERT INTO eBayFeed_VehicleModels:');
            console.log(JSON.stringify(junction, null, 2));
            console.log('');
        }
    } else {
        console.log('\n┌─────────────────────────────────────────────┐');
        console.log('│ ALTERNATIVE: Store as JSON in eBayFeed     │');
        console.log('└─────────────────────────────────────────────┘\n');

        // Parse the text field
        const compatibleText = listing['Compatible with'] || listing['Oc8R'];
        const vehiclesFromText = compatibleText ? compatibleText.split(',').map((s: string) => s.trim()) : [];

        const jsonField = {
            compatible_vehicles: vehiclesFromText.map((name: string) => ({
                name,
                source: 'text_field',
                confidence: 'medium' // because it's parsed from text
            }))
        };

        console.log('UPDATE eBayFeed SET compatible_vehicles_json = ');
        console.log(JSON.stringify(jsonField, null, 2));
        console.log('');
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 MIGRATION SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`Source SKU:               ${listing.SKU || listing['0000']}`);
    console.log(`Compatible Records Found: ${compatibleRecords.length}`);
    console.log(`Vehicle Models Found:     ${vehicleModels.length}`);
    console.log('');

    console.log('NocoDB Tables to Update:');
    console.log(`   1. eBayFeed                 → 1 INSERT`);
    if (vehicleModels.length > 0) {
        console.log(`   2. VehicleModelSources      → ${vehicleModels.length} INSERT(s)`);
        console.log(`   3. eBayFeed_VehicleModels   → ${vehicleModels.length} INSERT(s)`);
    } else {
        console.log(`   2. (no vehicle data, use JSON field instead)`);
    }
    console.log('');

    console.log('🎯 Recommendation:');
    if (vehicleModels.length > 0) {
        console.log('   ✅ Use OPTION B: Create proper relations via Junction Table');
        console.log('   ✅ This preserves all vehicle details (ABE-Nr, Tire Size, etc.)');
    } else {
        console.log('   ⚠️  Use OPTION A: Store "Compatible with" TEXT in JSON field');
        console.log('   ⚠️  Less precise, but works with unpopulated links');
    }
    console.log('');

    // Save full example
    const fullExample = {
        source: {
            ebayListing: listing,
            compatibleRecords,
            vehicleModels
        },
        target: {
            ebayFeed: ebayFeedEntry,
            vehicleModelSources: vehicleModels.map(vm => ({
                name: vm.Name || vm['0000'],
                abe_nr: vm['ABE-Nr'] || vm['71No']
            })),
            junction: vehicleModels.map(vm => ({
                ebay_feed_sku: listing.SKU || listing['0000'],
                vehicle_model_name: vm.Name || vm['0000']
            }))
        }
    };

    writeFileSync('migration-example.json', JSON.stringify(fullExample, null, 2));
    console.log('✅ Full example saved to: migration-example.json\n');
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});
