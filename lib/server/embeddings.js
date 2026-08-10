// Server-side text embedding via Voyage AI.
//
// Turns the plain-text representation of a profile (web.profile_embedding_text)
// into a fixed-length vector we store in web.profile_embeddings for semantic
// "Similar Workers" search. Provider details live here only — swapping models
// or providers is a change to this one module.
//
// Env:
//   VOYAGE_API_KEY       (required) Voyage API key
//   EMBEDDING_MODEL      (optional) default "voyage-3.5-lite"
//   EMBEDDING_DIMENSION  (optional) default 1024 — must match the pgvector
//                        column width in sql/migrations/add_profile_embeddings.sql
//   VOYAGE_API_URL       (optional) default "https://api.voyageai.com/v1/embeddings"

import axios from 'axios';
import { AppError } from './app-error.js';

const API_URL = process.env.VOYAGE_API_URL || 'https://api.voyageai.com/v1/embeddings';
const MODEL = process.env.EMBEDDING_MODEL || 'voyage-3.5-lite';
const DIMENSION = parseInt(process.env.EMBEDDING_DIMENSION || '1024', 10);

// Voyage accepts up to 128 inputs per request; keep batches conservative.
const MAX_BATCH = 128;

function apiKey(){
    const key = process.env.VOYAGE_API_KEY;
    if(!key)
        throw new AppError("VOYAGE_API_KEY is not configured");
    return key;
}

async function callVoyage(input, inputType){
    const body = {
        input,                       // string or string[]
        model: MODEL,
        output_dimension: DIMENSION,
    };
    if(inputType != null)
        body.input_type = inputType; // "document" for stored profiles, "query" for searches

    let response;
    try{
        response = await axios.post(API_URL, body, {
            headers: {
                'Authorization': 'Bearer ' + apiKey(),
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
    }catch(error){
        const detail = error.response
            ? `status ${error.response.status}: ${JSON.stringify(error.response.data)}`
            : error.message;
        throw new AppError("Voyage embedding request failed: " + detail);
    }

    const data = response.data && response.data.data;
    if(!Array.isArray(data))
        throw new AppError("Voyage embedding response missing data array");
    // Preserve request order (Voyage returns an `index` on each item).
    return data
        .slice()
        .sort((a, b) => a.index - b.index)
        .map(item => item.embedding);
}

/** Embed a single string. Returns a Number[] of length DIMENSION. */
export async function embedText(text, inputType = 'document'){
    const [vector] = await callVoyage([text], inputType);
    return vector;
}

/** Embed many strings, batching under Voyage's per-request input cap.
 *  Returns Number[][] aligned to the input order. */
export async function embedTexts(texts, inputType = 'document'){
    const out = [];
    for(let i = 0; i < texts.length; i += MAX_BATCH){
        const batch = texts.slice(i, i + MAX_BATCH);
        const vectors = await callVoyage(batch, inputType);
        out.push(...vectors);
    }
    return out;
}

/** Format a Number[] as a pgvector text literal: "[0.12,-0.34,...]".
 *  We pass embeddings to PostgREST as text (see web.upsert_profile_embedding)
 *  to avoid JSON<->vector serialization ambiguity. */
export function toVectorLiteral(vector){
    return '[' + vector.join(',') + ']';
}

export { DIMENSION as embeddingDimension, MODEL as embeddingModel };
