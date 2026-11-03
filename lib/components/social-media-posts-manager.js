import * as sharedUtils from '../shared/shared-utils';
import { parseCsv } from '../shared/csv-parse';
import * as cardSpec from '../shared/social-post-image';
import { cardDataUrl, cardUploadPayload } from '../client/social-post-image';
import alertify from 'alertifyjs';

/**
 * INPUT params
 *  - appState: AppState object (required) - used to access `da` (data-access)
 *
 * Site-admin dashboard page for the manually-curated social media post queue.
 * Each post has a title, description, optional image URL, optional link URL,
 * and a post date. The /feeds/posts RSS feed exposes the posts whose post_date
 * is the current day, which dlvr.it reads to publish to social media.
 *
 * A post with no image URL and a short enough description gets a sharing image
 * generated for it: the text set large on a colored brand background. It is
 * rendered here in the browser (lib/client/social-post-image.js), stored through
 * /api/uploadSocialPostImage, and kept in data.generated_image_url so the feed
 * can attach it. The same renderer drives the previews on this page.
 */
export function register(){
    const name = "social-media-posts-manager";
    ko.components.register(name,{
        viewModel: function(params){
            const self = this;

            try{
                sharedUtils.ensureFields(params,['appState']);
            }catch(err){
                console.error(name+" missing params: ",err);
                return;
            }

            self.appState = params.appState;
            self.da = self.appState.da;

            self.posts = ko.observableArray([]);
            self.loading = ko.observable(false);
            self.saving = ko.observable(false);
            self.importing = ko.observable(false);
            self.editingKey = ko.observable(null); // social_media_post_key being edited, or null for new

            const today = new Date().toISOString().slice(0,10);
            self.editor = {
                title: ko.observable(''),
                description: ko.observable(''),
                image_url: ko.observable(''),
                link_url: ko.observable(''),
                post_date: ko.observable(today),
                // sharing image generated for this post on a previous save, if any
                generated_image_url: ko.observable(''),
                // which brand color this post's card uses; fixed for the life of
                // the post so it does not repaint while the description is typed
                image_theme: ko.observable(cardSpec.randomThemeIndex()),
            };

            // ---- generated sharing image ----------------------------------
            self.maxImageTextLength = cardSpec.MAX_IMAGE_TEXT_LENGTH;
            self.previewUrl = ko.observable('');       // '' when there is nothing to show
            self.previewGenerated = ko.observable(false); // true when it is our text card
            self.previewTooLong = ko.observable(false);   // text is past the card limit
            self.descriptionLength = ko.pureComputed(function(){
                return (self.editor.description() || '').trim().length;
            });

            // Renders the card for the editor's current text, or shows the
            // admin-supplied image when there is one. Async, so a token guards
            // against a slow render landing after a newer one.
            let previewToken = 0;
            self.refreshPreview = async function(){
                const token = ++previewToken;
                const imageUrl = (self.editor.image_url() || '').trim();
                const text = (self.editor.description() || '').trim();

                if(imageUrl !== ''){
                    self.previewTooLong(false);
                    self.previewGenerated(false);
                    self.previewUrl(imageUrl);
                    return;
                }
                self.previewGenerated(true);
                if(text === ''){
                    self.previewTooLong(false);
                    self.previewUrl('');
                    return;
                }
                if(text.length > cardSpec.MAX_IMAGE_TEXT_LENGTH){
                    self.previewTooLong(true);
                    self.previewUrl('');
                    return;
                }
                self.previewTooLong(false);
                try{
                    const url = await cardDataUrl(text, self.editor.image_theme());
                    if(token === previewToken)
                        self.previewUrl(url);
                }catch(err){
                    console.error('failed to render social post preview: ',err);
                    if(token === previewToken)
                        self.previewUrl('');
                }
            };

            let previewTimer = null;
            function schedulePreview(){
                if(previewTimer != null) clearTimeout(previewTimer);
                previewTimer = setTimeout(function(){
                    previewTimer = null;
                    self.refreshPreview();
                },300);
            }
            self.editor.description.subscribe(schedulePreview);
            self.editor.image_url.subscribe(schedulePreview);

            // Renders the card and stores it, returning its public URL.
            self.generateAndStoreImage = async function(text,themeIndex){
                const payload = await cardUploadPayload(text, themeIndex);
                const result = await self.appState.server.authPostJson(
                    '/api/uploadSocialPostImage', payload);
                if(result == null || !result.url)
                    throw new Error('no image URL returned');
                return result.url;
            };

            // Fills in post.generated_image_url, generating and storing the card
            // when the post qualifies. Never throws: the image is optional, so a
            // failure here must not block saving the post itself.
            self.attachGeneratedImage = async function(post){
                if(post.image_url || !cardSpec.shouldGenerateImage(post)){
                    post.generated_image_url = '';
                    return null;
                }
                const themeIndex = cardSpec.themeIndexFor(post);
                try{
                    post.generated_image_url = await self.generateAndStoreImage(post.description, themeIndex);
                    return null;
                }catch(err){
                    console.error('failed to generate sharing image: ',err);
                    // Card names are a hash of the text and theme, so a stored card
                    // whose name still matches is the right one and can be kept
                    // through a transient upload failure. Anything else would be stale.
                    const wanted = cardSpec.imageFilename(post.description, themeIndex);
                    if(!String(post.generated_image_url || '').endsWith('/'+wanted))
                        post.generated_image_url = '';
                    return (err && (err.responseJSON && err.responseJSON.message)) ||
                           (err && err.message) || String(err);
                }
            };

            self.resetEditor = function(){
                self.editingKey(null);
                self.editor.title('');
                self.editor.description('');
                self.editor.image_url('');
                self.editor.link_url('');
                self.editor.generated_image_url('');
                self.editor.image_theme(cardSpec.randomThemeIndex());
                self.editor.post_date(new Date().toISOString().slice(0,10));
                self.refreshPreview();
            };

            // Gives each queued post a thumbnail for the list: its stored image
            // when it has one, otherwise a locally-rendered card so the admin can
            // see what saving the post would attach.
            async function addPreviews(list){
                for(const post of list){
                    const stored = cardSpec.sharingImageUrl(post);
                    if(stored !== ''){
                        post.preview_url = stored;
                        post.preview_unsaved = false;
                        continue;
                    }
                    post.preview_unsaved = true;
                    if(cardSpec.shouldGenerateImage(post)){
                        try{
                            post.preview_url = await cardDataUrl(
                                cardSpec.imageText(post), cardSpec.themeIndexFor(post));
                        }catch(err){
                            console.error('failed to render post preview: ',err);
                            post.preview_url = '';
                        }
                    }else{
                        post.preview_url = '';
                    }
                }
                return list;
            }

            self.loadPosts = async function(){
                self.loading(true);
                try{
                    const results = await self.da.getSocialMediaPosts();
                    const list = Array.isArray(results) ? results : (results == null ? [] : [results]);
                    self.posts(await addPreviews(list));
                }catch(error){
                    console.error("failed to load social media posts: ",error);
                    self.posts([]);
                }finally{
                    self.loading(false);
                }
            };

            self.startEdit = function(p){
                if(!p) return;
                const data = p.data || {};
                self.editingKey(p.social_media_post_key);
                self.editor.title(data.title || '');
                self.editor.description(data.description || '');
                self.editor.image_url(data.image_url || '');
                self.editor.link_url(data.link_url || '');
                self.editor.generated_image_url(data.generated_image_url || '');
                self.editor.image_theme(cardSpec.themeIndexFor(p));
                self.editor.post_date(p.post_date || new Date().toISOString().slice(0,10));
                self.refreshPreview();
            };

            self.cancelEdit = function(){
                self.resetEditor();
            };

            self.savePost = async function(){
                const post = {
                    title: (self.editor.title() || '').trim(),
                    description: (self.editor.description() || '').trim(),
                    image_url: (self.editor.image_url() || '').trim(),
                    link_url: (self.editor.link_url() || '').trim(),
                    post_date: self.editor.post_date(),
                    generated_image_url: (self.editor.generated_image_url() || '').trim(),
                    image_theme: self.editor.image_theme(),
                };
                if(!post.title || !post.description){
                    alertify.error('Title and description are required');
                    return;
                }
                if(!post.post_date){
                    alertify.error('A post date is required');
                    return;
                }

                self.saving(true);
                try{
                    const imageError = await self.attachGeneratedImage(post);
                    const key = self.editingKey();
                    if(key != null)
                        await self.da.updateSocialMediaPost(key, post);
                    else
                        await self.da.createSocialMediaPost(post);
                    await self.loadPosts();
                    self.resetEditor();
                    if(imageError)
                        alertify.warning('Post saved, but the sharing image could not be generated: '+imageError);
                    else
                        alertify.success('Post saved');
                }catch(err){
                    console.error('failed to save social media post: ',err);
                    alertify.error('Failed to save post: '+(err && err.message || err));
                }finally{
                    self.saving(false);
                }
            };

            self.deletePost = function(p){
                if(!p) return;
                alertify.confirm('Delete Post','Are you sure you want to permanently delete this post?', async function(){
                    try{
                        await self.da.deleteSocialMediaPost(p.social_media_post_key);
                        if(self.editingKey() === p.social_media_post_key)
                            self.resetEditor();
                        await self.loadPosts();
                        alertify.success('Post deleted');
                    }catch(err){
                        console.error('failed to delete social media post: ',err);
                        alertify.error('Failed to delete post: '+(err && err.message || err));
                    }
                }, function(){ /* cancel */ });
            };

            // ---- CSV import -----------------------------------------------
            // Expected columns (matched by header name, case-insensitive):
            //   title (required), description (required), image_url, link_url,
            //   post_date (required, YYYY-MM-DD)
            const CSV_COLUMNS = ['title','description','image_url','link_url','post_date'];
            const REQUIRED_COLUMNS = ['title','description','post_date'];

            self.onCsvFileChange = function(vm, event){
                const input = event.target;
                const file = input && input.files && input.files[0];
                if(!file) return;
                const reader = new FileReader();
                reader.onload = function(){
                    self.importCsv(String(reader.result || ''));
                    input.value = ''; // allow re-selecting the same file
                };
                reader.onerror = function(){
                    console.error('failed to read CSV file: ',reader.error);
                    alertify.error('Could not read the selected file');
                    input.value = '';
                };
                reader.readAsText(file);
            };

            self.importCsv = async function(text){
                let parsed;
                try{
                    parsed = parseCsv(text);
                }catch(err){
                    console.error('failed to parse CSV: ',err);
                    alertify.error('Could not parse the CSV file');
                    return;
                }

                const headers = parsed.headers.map(h => h.toLowerCase());
                const missing = REQUIRED_COLUMNS.filter(c => headers.indexOf(c) === -1);
                if(missing.length){
                    alertify.error('CSV is missing required column(s): '+missing.join(', '));
                    return;
                }
                if(!parsed.rows.length){
                    alertify.error('CSV has no data rows');
                    return;
                }

                // resolve each expected column to its index (case-insensitive)
                const colIndex = {};
                CSV_COLUMNS.forEach(c => { colIndex[c] = headers.indexOf(c); });
                const cell = (rowObj, col) => {
                    const idx = colIndex[col];
                    if(idx === -1) return '';
                    const key = parsed.headers[idx];
                    return String(rowObj[key] == null ? '' : rowObj[key]).trim();
                };

                self.importing(true);
                let imported = 0;
                const skipped = [];
                const warnings = []; // rows that imported, but without a sharing image
                try{
                    for(let i = 0; i < parsed.rows.length; i++){
                        const rowNum = i + 2; // +1 for header, +1 for 1-based
                        const rowObj = parsed.rows[i];
                        const post = {
                            title: cell(rowObj,'title'),
                            description: cell(rowObj,'description'),
                            image_url: cell(rowObj,'image_url'),
                            link_url: cell(rowObj,'link_url'),
                            post_date: cell(rowObj,'post_date'),
                            // each imported post gets its own color, fixed from here on
                            image_theme: cardSpec.randomThemeIndex(),
                        };

                        if(!post.title || !post.description){
                            skipped.push('Row '+rowNum+': missing title or description');
                            continue;
                        }
                        if(!isValidDate(post.post_date)){
                            skipped.push('Row '+rowNum+': invalid post_date "'+post.post_date+'" (expected YYYY-MM-DD)');
                            continue;
                        }

                        try{
                            const imageError = await self.attachGeneratedImage(post);
                            if(imageError)
                                warnings.push('Row '+rowNum+': no sharing image ('+imageError+')');
                            await self.da.createSocialMediaPost(post);
                            imported++;
                        }catch(err){
                            console.error('failed to import row '+rowNum+': ',err);
                            skipped.push('Row '+rowNum+': '+(err && err.message || err));
                        }
                    }
                }finally{
                    self.importing(false);
                }

                await self.loadPosts();

                if(skipped.length === 0 && warnings.length === 0){
                    alertify.success(imported+' post'+(imported===1?'':'s')+' imported');
                }else{
                    const list = items => '<ul><li>'+items.map(escapeHtml).join('</li><li>')+'</li></ul>';
                    let summary = '<p>'+imported+' imported, '+skipped.length+' skipped';
                    summary += skipped.length ? ':</p>'+list(skipped) : '.</p>';
                    if(warnings.length)
                        summary += '<p>Imported without a sharing image:</p>'+list(warnings);
                    alertify.alert('Import complete', summary);
                }
            };

            self.downloadCsvTemplate = function(){
                const header = CSV_COLUMNS.join(',');
                const example = [
                    'Example post title',
                    'A description that, notably, contains a comma.',
                    'https://example.com/image.png',
                    'https://ergatas.org/some-link',
                    new Date().toISOString().slice(0,10),
                ].map(f => '"'+String(f).replace(/"/g,'""')+'"').join(',');
                const csv = header+'\n'+example+'\n';
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'social-media-posts-template.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            };

            function isValidDate(s){
                if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
                const d = new Date(s+'T00:00:00');
                return !isNaN(d.getTime()) && s === d.toISOString().slice(0,10);
            }

            function escapeHtml(s){
                return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            }

            // initial load
            self.refreshPreview();
            self.loadPosts();
        },
        template: require('./social-media-posts-manager.html')
    });
}
