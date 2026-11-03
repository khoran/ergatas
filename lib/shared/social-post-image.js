// Shared rules for the auto-generated "text card" sharing image used by social
// media posts that have no image of their own.
//
// A post's feed enclosure is data.image_url when the admin supplied one,
// otherwise data.generated_image_url -- a PNG we render from the post text on a
// colored background (see lib/client/social-post-image.js for the renderer, and
// /api/uploadSocialPostImage for where it gets stored).

// Longest description we will typeset onto a card. Past this the text has to be
// set so small that the image stops being readable in a social feed.
export const MAX_IMAGE_TEXT_LENGTH = 220;

// Open Graph / Twitter summary_large_image dimensions.
export const IMAGE_WIDTH = 1200;
export const IMAGE_HEIGHT = 630;

// Ergatas brand colors, from lib/scss/styles.scss. Mostly dark cards with light
// text; the last one is the inverse so a queue of posts isn't monotonous.
export const THEMES = [
    { bg:"#224845", text:"#F7F7F7", accent:"#edb53a" }, // dark teal
    { bg:"#335060", text:"#F7F7F7", accent:"#edb53a" }, // dw blue
    { bg:"#332310", text:"#F7F7F7", accent:"#edb53a" }, // dark brown
    { bg:"#012245", text:"#F7F7F7", accent:"#edb53a" }, // dark blue
    { bg:"#42876a", text:"#FFFFFF", accent:"#f7da57" }, // green
    { bg:"#eae1da", text:"#332310", accent:"#42876a" }, // light beige
];

// The text a post's card shows. Feed items carry no <title> (see feeds.js), so
// the description is the whole post and therefore the whole card.
export function imageText(post){
    const data = (post && post.data) || post || {};
    return String(data.description == null ? "" : data.description).trim();
}

// True when we should render a card for this post: no admin-supplied image, and
// text that is present and short enough to set large.
export function shouldGenerateImage(post){
    const data = (post && post.data) || post || {};
    const supplied = data.image_url;
    if(supplied != null && String(supplied).trim() !== "")
        return false;
    const text = imageText(post);
    return text.length > 0 && text.length <= MAX_IMAGE_TEXT_LENGTH;
}

// The image a post should share: the admin's image wins, then a generated card.
export function sharingImageUrl(post){
    const data = (post && post.data) || post || {};
    const supplied = data.image_url;
    if(supplied != null && String(supplied).trim() !== "")
        return String(supplied).trim();
    const generated = data.generated_image_url;
    if(generated != null && String(generated).trim() !== "")
        return String(generated).trim();
    return "";
}

// FNV-1a, so the same text and theme always produce the same blob name.
export function textHash(text){
    let hash = 0x811c9dc5;
    const s = String(text == null ? "" : text);
    for(let i = 0; i < s.length; i++){
        hash ^= s.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

export function isThemeIndex(index){
    return Number.isInteger(index) && index >= 0 && index < THEMES.length;
}

export function themeAt(index){
    return THEMES[isThemeIndex(index) ? index : 0];
}

// A post's color is picked once and then stays put -- deriving it from the text
// would repaint the card on every keystroke. Saved posts carry the index in
// data.image_theme; older posts that predate it fall back to their key, which is
// just as stable.
export function themeIndexFor(post){
    const record = post || {};
    const data = record.data || record;
    if(isThemeIndex(data.image_theme))
        return data.image_theme;
    const key = record.social_media_post_key;
    if(key != null && !isNaN(Number(key)))
        return Math.abs(Math.trunc(Number(key))) % THEMES.length;
    return 0;
}

// Color for a post being composed, chosen once when the editor opens.
export function randomThemeIndex(){
    return Math.floor(Math.random() * THEMES.length);
}

// Content-addressed name, so re-rendering the same card overwrites the same blob
// instead of leaving an orphan behind on every edit. The theme is part of the
// name because it is part of the image.
export function imageFilename(text,themeIndex){
    const index = isThemeIndex(themeIndex) ? themeIndex : 0;
    return "post-"+textHash(index+"|"+text).toString(16)+".png";
}
