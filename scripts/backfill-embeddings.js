// One-time backfill of semantic-search embeddings for existing profiles.
//
// Generates and stores a Voyage embedding for every published/current profile
// (web.profile_search) that a save would otherwise produce. Safe to re-run —
// web.upsert_profile_embedding overwrites existing rows.
//
// Usage (from the repo root, with .env populated incl. VOYAGE_API_KEY and
// POSTGREST_SERVER_URL_BASE):
//     node scripts/backfill-embeddings.js
//
// Run the sql/migrations/add_profile_embeddings.sql migration first.

import 'dotenv/config';
import * as utils from '../lib/server/utils.js';
import * as embeddings from '../lib/server/embeddings.js';

const CONCURRENCY = 5;

async function main(){
    const db = await utils.getServerDB();
    const rows = await db.getAllProfileKeys();          // published/current only
    const keys = rows.map(r => r.missionary_profile_key);

    console.log(`Backfilling embeddings for ${keys.length} published profiles ` +
                `(model=${embeddings.embeddingModel}, dim=${embeddings.embeddingDimension})`);

    let embedded = 0, skipped = 0, failed = 0, idx = 0;

    async function worker(){
        while(idx < keys.length){
            const key = keys[idx++];
            try{
                const written = await utils.updateProfileEmbedding(key);
                if(written) embedded++; else skipped++;
            }catch(error){
                failed++;
                console.error(`  failed key ${key}: ${error.message}`);
            }
            const done = embedded + skipped + failed;
            if(done % 50 === 0 || done === keys.length)
                console.log(`  ${done}/${keys.length} (embedded=${embedded} skipped=${skipped} failed=${failed})`);
        }
    }

    await Promise.all(
        Array.from({length: Math.min(CONCURRENCY, keys.length)}, worker)
    );

    console.log(`Done. embedded=${embedded}, skipped_no_text=${skipped}, ` +
                `failed=${failed}, total=${keys.length}`);
}

main()
    .then(() => process.exit(0))
    .catch(error => { console.error(error); process.exit(1); });
