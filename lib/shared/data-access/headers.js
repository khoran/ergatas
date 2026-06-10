// Pure PostgREST header transforms. Each takes an optional headers object,
// mutates/returns it, and composes (e.g. H.single(H.representation())).
// `auth` is NOT here — it needs the token and lives on PostgrestClient.

export function appendHeader(headers,field,content){
    if(headers[field]!=null)
        headers[field]=headers[field]+", "+content;
    else
        headers[field]=content;
}
export function single(headers){
    headers = headers || {};
    headers['Accept']= "application/vnd.pgrst.object+json";
    return headers;
}
export function minimal(headers){
    headers = headers || {};
    appendHeader(headers,"Prefer","return=minimal");
    return headers;
}
//return full object after insert/update
export function representation(headers){
    headers = headers || {};
    appendHeader(headers,"Prefer","return=representation");
    return headers;
}
export function ignoreDups(headers){
    headers = headers || {};
    appendHeader(headers,"Prefer","resolution=ignore-duplicates");
    return headers;
}
export function setRange(headers,range){
    headers = headers || {};
    if(range != null){
        headers["Range-Unit"]="items";
        headers["Range"]=range;
        appendHeader(headers,"Prefer","count=estimated");
    }
    return headers;
}
