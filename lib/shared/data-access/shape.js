import {AppError} from '../../server/app-error.js';

// Pure result-shaping + record-normalization helpers. No transport, no token.

// the 'single" modifier throws an error if 0 results are returned, so this
// is an alternative to use when 0 or 1 is acceptable. return null for 0 results.
export function singleOrNone(result){
    //console.log("singleOrNone called with result: ",result);
    if(result != null && result.length == 1)
        return result[0];
    else if(typeof result === 'object' && Object.keys(result).length > 0)
        return result;
    else if(result.length === 0 || Object.keys(result).length === 0)
        return null;
    else
        throw new AppError("multiple results returned for when only 1 or 0 where expected. "+JSON.stringify(result));
}

//when fields are added or removed from the JSON schema,
// apply the update here by adding or removing the required fields
export function updateProfileFields(profile){
    var data;
    var initEmptyString=["country","donate_instructions","country_code","marital_status","video_url",
                            "search_terms"];
    var initEmptyArray=["impact_countries","tag_keys","kids_birth_years","cause_keys","people_id3_codes",
                         "rol3_codes"];
    //console.log("pre-updated profile: ",profile);
    if(Array.isArray(profile)){ // update each element of array
        return profile.map( p => updateProfileFields(p))
    }else{ //update this profile
        data = profile.data;

        profile.data = normalizeProfileData(data);
        data = profile.data;

        initEmptyString.forEach( f => {
            if(data[f] == null)
                data[f] = "";
        } );
        initEmptyArray.forEach( f => {
            if(data[f] == null)
                data[f] = [];
        } );

        if(data.movement_stage == null)
            data.movement_stage= -1;

        if(data.limit_social_media == null)
            data.limit_social_media = false;

        if(data.on_site_donation == null)
            data.on_site_donation = true;

        if(data.use_mpk_prefix == null)
            data.use_mpk_prefix = false;

        if(data.donations_enabled == null)
            data.donations_enabled = true;

    }
    //console.log("updated profile: ",profile);
    return profile;

}

export function normalizeProfileData(data){
    data = data || {};

    return data;
}

export function normalizePostRecord(post){
    const normalized = post || {};
    normalized.data = normalized.data || {};
    normalized.post_type = normalized.data.post_type === 'prayer request' ? 'prayer request' : 'update';
    normalized.post_content = normalized.data.post_content || '';
    normalized.date_added = normalized.date_added || new Date().toISOString().slice(0,10);
    normalized.prayer_count = parseInt(normalized.prayer_count) || 0;
    return normalized;
}

export function updatePostFields(post){
    if(Array.isArray(post))
        return post.map(p => normalizePostRecord(p));
    return normalizePostRecord(post);
}

export function postPayload(post){
    const normalized = normalizePostRecord({
        ...post,
        data: {
            post_type: post != null ? post.post_type : undefined,
            post_content: post != null ? post.post_content : undefined,
        }
    });

    return {
        missionary_profile_key: post.missionary_profile_key,
        date_added: normalized.date_added,
        prayer_count: normalized.prayer_count,
        data: {
            post_type: normalized.post_type,
            post_content: normalized.post_content,
        },
    };
}

export function updateNonProfitFields(nonProfit){
    var data;
    //console.log("pre-updated nonProfit: ",nonProfit);

    if(Array.isArray(nonProfit)){ // update each element of array
        return nonProfit.map( o => updateNonProfitFields(o))
    }else{ //update this nonProfit
        if(nonProfit.donation_settings == null)
            nonProfit.donation_settings = {};

        data = nonProfit.donation_settings;

        if(data.address_field_status == null)
            data.address_field_status = "optional";

        if(data.phone_field_status == null)
            data.phone_field_status = "hidden";

        if(data.send_receipt == null)
            data.send_receipt = true;

    }
    return nonProfit
}
