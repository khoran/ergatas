// Page/snippet template loading. Templates are read at build time via webpack's
// context `require(...)`; the relative paths must stay resolved from lib/client/.

export function initTemplates(client){
    client.pageInfo = require("../data/page_info.json");
    //console.log("pageInfo: ",client.pageInfo);
    const pages = Object.keys(client.pageInfo).filter(p=>client.pageInfo[p].alias_for == null);
    //console.log("pages: ",pages);

    const snippets = ["message-form"];
    client.templates={pages:[],snippets:[]};
    pages.forEach(name =>{
        try{
            client.templates.pages[name] = jQuery(require("../page-templates/"+(client.pageInfo[name].path || "")+name+".html"));
        }catch(error){
            if(client.pageInfo[name].virtual !== true)
                console.error("failed to load template for page "+name,error);
        }
    });
    snippets.forEach(name =>{
        client.templates.snippets[name] = jQuery(require("../snippet-templates/"+name+".html"));
    });
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
