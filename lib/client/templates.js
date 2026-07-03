// Page/snippet template loading. Page templates are read at build time via
// webpack's context `require(...)`; the relative paths must stay resolved from
// lib/client/. Snippets are imported statically — a dynamic
// require("../snippet-templates/"+name) would make webpack bundle every file
// in that directory, including the server-only email templates.
import messageFormSnippet from '../snippet-templates/message-form.html';

export function initTemplates(client){
    client.pageInfo = require("../data/page_info.json");
    //console.log("pageInfo: ",client.pageInfo);
    const pages = Object.keys(client.pageInfo).filter(p=>client.pageInfo[p].alias_for == null);
    //console.log("pages: ",pages);

    client.templates={pages:[],snippets:[]};
    pages.forEach(name =>{
        try{
            client.templates.pages[name] = jQuery(require("../page-templates/"+(client.pageInfo[name].path || "")+name+".html"));
        }catch(error){
            if(client.pageInfo[name].virtual !== true)
                console.error("failed to load template for page "+name,error);
        }
    });
    client.templates.snippets["message-form"] = jQuery(messageFormSnippet);
}
export function getPage(client,name){
    return client.templates.pages[name];
}
export function pageExists(client,name){
    //return client.templates.pages[name] != null;
    return client.pageInfo[name] != null;
}
export function getSnippet(client,name){
    return client.templates.snippets[name];
}
