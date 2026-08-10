// Minimal, dependency-free RFC-4180-style CSV parser.
//
// Handles: quoted fields, embedded commas/newlines inside quotes, escaped
// double-quotes (""), and both CRLF and LF line endings. A trailing newline
// does not produce an empty trailing record.
//
// parseCsv(text) -> { headers: string[], rows: Array<Object> }
//   - headers are taken from the first record, trimmed.
//   - each row is an object keyed by header. Extra columns beyond the header
//     count are ignored; missing columns default to ''.

// Split raw CSV text into an array of records, each an array of field strings.
function tokenize(text){
    const records = [];
    let field = '';
    let record = [];
    let inQuotes = false;
    let sawAnyChar = false; // did the current record contain any character at all?

    for(let i = 0; i < text.length; i++){
        const c = text[i];

        if(inQuotes){
            if(c === '"'){
                if(text[i+1] === '"'){ // escaped quote
                    field += '"';
                    i++;
                }else{
                    inQuotes = false;
                }
            }else{
                field += c;
            }
            continue;
        }

        if(c === '"'){
            inQuotes = true;
            sawAnyChar = true;
        }else if(c === ','){
            record.push(field);
            field = '';
            sawAnyChar = true;
        }else if(c === '\r'){
            // end of record; swallow a following \n (CRLF)
            record.push(field);
            records.push(record);
            record = [];
            field = '';
            sawAnyChar = false;
            if(text[i+1] === '\n') i++;
        }else if(c === '\n'){
            record.push(field);
            records.push(record);
            record = [];
            field = '';
            sawAnyChar = false;
        }else{
            field += c;
            sawAnyChar = true;
        }
    }

    // flush the final field/record if the file didn't end with a newline
    if(sawAnyChar || field !== '' || record.length > 0){
        record.push(field);
        records.push(record);
    }

    return records;
}

export function parseCsv(text){
    if(text == null) return { headers: [], rows: [] };

    // strip a UTF-8 BOM if present
    if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const records = tokenize(text).filter(r => !(r.length === 1 && r[0].trim() === ''));
    if(records.length === 0) return { headers: [], rows: [] };

    const headers = records[0].map(h => h.trim());
    const rows = records.slice(1).map(rec => {
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = rec[idx] != null ? rec[idx] : '';
        });
        return obj;
    });

    return { headers, rows };
}
