#!/usr/bin/env ts-node
/**
 * Migration script for existing brain memories
 *
 * Adds new fields to existing memories:
 * - visibility (default: private)
 * - quality fields (recallCount, boostCount, etc.)
 * - status (default: active)
 */

import { QdrantClient } from '../src/lib/biz/qdrant.js';

const MEMORIES_COLLECTION = 'agent-memories';

async function migrate() {
    console.log('🔄 Migrating brain memories...\n');

    const client = QdrantClient.fromConfig();

    // Get all points
    console.log('  Fetching all memories...');
    const memories = await client.scroll(MEMORIES_COLLECTION, {
        limit: 10000,
        with_payload: true,
    });

    console.log(`  Found ${memories.length} memories\n`);

    let migrated = 0;
    let skipped = 0;

    for (const memory of memories) {
        // Check if already migrated
        if (memory.payload.visibility !== undefined) {
            skipped++;
            continue;
        }

        // Add new fields
        try {
            await client.setPayload(MEMORIES_COLLECTION, memory.id, {
                // Phase 2: Visibility
                visibility: 'private',
                useCount: 0,
                endorsements: 0,
                // Phase 3: Quality
                recallCount: 0,
                boostCount: 0,
                downvoteCount: 0,
                qualityScore: 1.0,
                status: 'active',
            });

            migrated++;

            if (migrated % 100 === 0) {
                console.log(`  Migrated ${migrated} memories...`);
            }
        } catch (error) {
            console.error(`  ❌ Failed to migrate ${memory.id}:`, error);
        }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`  Migrated: ${migrated}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Total: ${memories.length}`);
}

migrate().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
});
