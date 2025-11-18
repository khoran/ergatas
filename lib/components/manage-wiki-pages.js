import * as sharedUtils from '../shared/shared-utils';
import alertify from 'alertifyjs';

/**
 * INPUT params
 *  - appState: AppState object (required) - used to access `da` (data-access)
 *  - navigateFn: optional navigate function (not required here)
 *
 * This component lists pages from `/pages_view` and allows viewing and
 * inline editing of a page's `data` object which contains `title`, `body`,
 * and `sidebar` fields. The editors use the project's existing `editor` binding.
 */
export function register(){
    const name = "manage-wiki-pages";
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
            self.pages = ko.observableArray([]);
            self.loading = ko.observable(false);
            self.editing = ko.observable(null); // the page currently being edited
            self.editCopy = ko.observable(); // deep copy of page.data for editing

            self.loadPages = async function(){
                self.loading(true);
                try{
                    // Use DataAccess convenience method if available
                    const results = await (typeof self.da.getPages === 'function' ? self.da.getPages() : self.da.dbGet('/pages_view'));
                    // Ensure array
                    if(Array.isArray(results))
                        self.pages(results);
                    else if(results == null)
                        self.pages([]);
                    else
                        self.pages([results]);
                }catch(error){
                    console.error("failed to load pages: ",error);
                    self.pages([]);
                }finally{
                    self.loading(false);
                }
            };

            self.viewPageHref = function(p){
                // assume slug maps to a top-level path
                return '/'+(p.slug || '');
            };

            self.startEdit = function(p){
                // create a cloned editable copy of data
                const data = p.data || {};
                // shallow clone is fine for simple title/body/sidebar strings
                const clone = {
                    // include slug so it can be edited
                    slug: ko.observable(p.slug || ''),
                    title: ko.observable(data.title || ''),
                    body: ko.observable(data.body || ''),
                    sidebar: ko.observable(data.sidebar || '')
                };
                self.editing(p);
                self.editCopy(clone);
            };

            self.cancelEdit = function(){
                self.editing(null);
                self.editCopy(undefined);
            };

            self.saveEdit = async function(){
                const p = self.editing();
                if(!p) return;
                // editCopy holds observables (title, body, sidebar). Convert to plain JS
                // so the data-access layer sends raw values to the DB, not ko observables.
                const editObj = self.editCopy();
                const full = ko.toJS(editObj);
                const data = Object.assign({}, full);
                // extract slug if present
                const newSlug = data.slug;
                delete data.slug;
                try{
                    // debug log (can be removed later)
                    console.debug('Saving page', p.page_key, data);
                        // validate slug if present
                        if(newSlug){
                            const m = /^[A-Za-z0-9\-/]+$/.exec(newSlug);
                            if(!m){
                                alertify.error('Slug may only contain letters, numbers, slashes, and hyphens');
                                return;
                            }
                        }
                        // If slug changed, include it in the patch; otherwise use updatePage convenience method
                        if(newSlug && newSlug !== p.slug){
                            // patch both slug and data using encapsulated data-access helper
                            await self.da.updatePageWithSlug(p.page_key, newSlug, data);
                            // refresh server-side slug cache now that a slug was changed/saved
                            await self.appState.server.postJson('/api/refreshSlugCache');
                        }else{
                            await self.da.updatePage(p.page_key, data);
                        }
                    await self.loadPages();
                    self.cancelEdit();
                }catch(err){
                    console.error("failed to save page: ",err);
                    alertify.error('Failed to save page: '+(err.message || err));
                }
            };

            self.deletePage = async function(p){
                if(!p) return;
                alertify.confirm('Delete Page','Are you sure you want to permanently delete this page?', async function(){
                    try{
                        await self.da.deletePage(p.page_key);
                        await self.loadPages();
                        self.cancelEdit();
                        alertify.success('Page deleted');
                    }catch(err){
                        console.error('failed to delete page: ',err);
                        alertify.error('Failed to delete page: '+(err && err.message || err));
                    }
                }, function(){ /* cancel */ });
            };

            self.createNewPage = function(){
                alertify.prompt('Create Page','Enter page slug (letters, numbers, hyphen).','', async function(evt, slug){
                    if(!slug || typeof slug !== 'string'){
                        alertify.error('Invalid slug');
                        return;
                    }
                    slug = slug.trim();
                    const m = /^[A-Za-z0-9\-/]+$/.exec(slug);
                    if(!m){
                        alertify.error('Slug may only contain letters, numbers, slashes, and hyphens');
                        return;
                    }

                    try{
                        // create with empty data
                        await self.da.createPage(slug, { title: '', body: '', sidebar: '' });
                        // refresh slug cache after creating a new page (new slug saved)
                        await self.appState.server.postJson('/api/refreshSlugCache');

                        await self.loadPages();
                        // open the new page for editing
                        const created = (self.pages() || []).find(p => p.slug === slug);
                        if(created) self.startEdit(created);
                        alertify.success('Page created');
                    }catch(err){
                        console.error('failed to create page: ',err);
                        alertify.error('Failed to create page: '+(err && err.message || err));
                    }

                }, function(){ /* cancel */ });
            };

            // initial load
            self.loadPages();
        },
        template: require('./manage-wiki-pages.html')
    });
}
