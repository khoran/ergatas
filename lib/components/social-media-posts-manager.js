import * as sharedUtils from '../shared/shared-utils';
import { parseCsv } from '../shared/csv-parse';
import alertify from 'alertifyjs';

/**
 * INPUT params
 *  - appState: AppState object (required) - used to access `da` (data-access)
 *
 * Site-admin dashboard page for the manually-curated social media post queue.
 * Each post has a title, description, optional image URL, optional link URL,
 * and a post date. The /feeds/posts RSS feed exposes the posts whose post_date
 * is the current day, which dlvr.it reads to publish to social media.
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
            };

            self.resetEditor = function(){
                self.editingKey(null);
                self.editor.title('');
                self.editor.description('');
                self.editor.image_url('');
                self.editor.link_url('');
                self.editor.post_date(new Date().toISOString().slice(0,10));
            };

            self.loadPosts = async function(){
                self.loading(true);
                try{
                    const results = await self.da.getSocialMediaPosts();
                    self.posts(Array.isArray(results) ? results : (results == null ? [] : [results]));
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
                self.editor.post_date(p.post_date || new Date().toISOString().slice(0,10));
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
                    const key = self.editingKey();
                    if(key != null)
                        await self.da.updateSocialMediaPost(key, post);
                    else
                        await self.da.createSocialMediaPost(post);
                    await self.loadPosts();
                    self.resetEditor();
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

                if(skipped.length === 0){
                    alertify.success(imported+' post'+(imported===1?'':'s')+' imported');
                }else{
                    const summary = '<p>'+imported+' imported, '+skipped.length+' skipped:</p>'+
                        '<ul><li>'+skipped.map(escapeHtml).join('</li><li>')+'</li></ul>';
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
            self.loadPosts();
        },
        template: require('./social-media-posts-manager.html')
    });
}
