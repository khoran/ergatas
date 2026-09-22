// Renders a social media post's text onto a colored card, in the browser.
//
// Used by the social-media-posts-manager for both the dashboard preview and the
// PNG that gets uploaded (via /api/uploadSocialPostImage) and attached to the
// /feeds/posts enclosure. Canvas is used rather than a server-side renderer
// because the browser already has the site's fonts; see lib/shared/social-post-image.js
// for the rules about when a card is generated at all.

import * as spec from '../shared/social-post-image';

const PADDING = 100;
const TEXT_TOP = 150;
const TEXT_BOTTOM = 500;   // leaves room for the wordmark below
const MAX_FONT_SIZE = 84;
const MIN_FONT_SIZE = 32;
const LINE_HEIGHT_RATIO = 1.22;
const BODY_FONT = '"D-DIN-bold", "D-DIN", Arial, sans-serif';
const MARK_FONT = '"D-DIN", Arial, sans-serif';

// The webfonts are lazy (font-display: swap), so ask for them explicitly before
// measuring -- otherwise the first card is laid out against the fallback face.
let fontsRequested = null;
function ensureFonts(){
    if(fontsRequested != null) return fontsRequested;
    if(typeof document === 'undefined' || document.fonts == null){
        fontsRequested = Promise.resolve();
        return fontsRequested;
    }
    fontsRequested = Promise.all([
        document.fonts.load('64px '+BODY_FONT).catch(()=>{}),
        document.fonts.load('28px '+MARK_FONT).catch(()=>{}),
    ]).catch(()=>{});
    return fontsRequested;
}

// Greedy word wrap at the given font size; returns null when a single word is
// too wide to fit, which tells the caller to try a smaller size.
function wrap(ctx, text, maxWidth){
    const words = text.split(/\s+/).filter(w => w !== '');
    const lines = [];
    let line = '';
    for(let i = 0; i < words.length; i++){
        const candidate = line === '' ? words[i] : line+' '+words[i];
        if(ctx.measureText(candidate).width <= maxWidth){
            line = candidate;
        }else{
            if(line === '') return null; // lone word wider than the card
            lines.push(line);
            line = words[i];
            if(ctx.measureText(line).width > maxWidth) return null;
        }
    }
    if(line !== '') lines.push(line);
    return lines;
}

// Largest font size at which the wrapped text still fits the text box.
function fitText(ctx, text, maxWidth, maxHeight){
    let fallback = null;
    for(let size = MAX_FONT_SIZE; size >= MIN_FONT_SIZE; size -= 2){
        ctx.font = size+'px '+BODY_FONT;
        const lines = wrap(ctx, text, maxWidth);
        if(lines == null) continue;
        fallback = { size: size, lines: lines };
        if(lines.length * size * LINE_HEIGHT_RATIO <= maxHeight)
            return fallback;
    }
    // Nothing fit cleanly: use the smallest layout we managed to wrap.
    return fallback || { size: MIN_FONT_SIZE, lines: [text] };
}

function drawWordmark(ctx, theme){
    ctx.font = '26px '+MARK_FONT;
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // canvas has no letter-spacing in older browsers, so space it by hand
    const label = 'ERGATAS.ORG';
    let x = PADDING;
    for(let i = 0; i < label.length; i++){
        ctx.fillText(label[i], x, 562);
        x += ctx.measureText(label[i]).width + 4;
    }
}

/**
 * Draw the card for `text` in theme `themeIndex` onto a canvas and return it.
 * Call ensureFonts() (or the async wrappers below) first for correct metrics.
 */
export function drawCard(text, themeIndex, canvas){
    const c = canvas || document.createElement('canvas');
    c.width = spec.IMAGE_WIDTH;
    c.height = spec.IMAGE_HEIGHT;

    const theme = spec.themeAt(themeIndex);
    const ctx = c.getContext('2d');

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, c.width, c.height);

    // accent rule above the text
    ctx.fillStyle = theme.accent;
    ctx.fillRect(PADDING, 92, 96, 8);

    const maxWidth = spec.IMAGE_WIDTH - (2 * PADDING);
    const maxHeight = TEXT_BOTTOM - TEXT_TOP;
    const fitted = fitText(ctx, text, maxWidth, maxHeight);
    const lineHeight = fitted.size * LINE_HEIGHT_RATIO;
    const blockHeight = fitted.lines.length * lineHeight;
    // vertically center the block within the text box
    let y = TEXT_TOP + Math.max(0, (maxHeight - blockHeight) / 2);

    ctx.font = fitted.size+'px '+BODY_FONT;
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    fitted.lines.forEach(line =>{
        ctx.fillText(line, PADDING, y);
        y += lineHeight;
    });

    drawWordmark(ctx, theme);
    return c;
}

/** Card for `text` as a data: URL, suitable for an <img src>. */
export async function cardDataUrl(text, themeIndex){
    await ensureFonts();
    return drawCard(text, themeIndex).toDataURL('image/png');
}

/**
 * Card for `text` as the pieces /api/uploadSocialPostImage wants:
 * bare base64 PNG plus the content-addressed filename it should be stored under.
 */
export async function cardUploadPayload(text, themeIndex){
    await ensureFonts();
    const dataUrl = drawCard(text, themeIndex).toDataURL('image/png');
    return {
        png: dataUrl.slice(dataUrl.indexOf(',') + 1),
        filename: spec.imageFilename(text, themeIndex),
    };
}
