import chai from 'chai';
import fs from 'fs';
import path from 'path';
const expect = chai.expect;

// Guard tests for the lazy-loading registries in lib/client/templates.js and
// lib/client/register-components.js. Those files only run under webpack (html
// requires, chunked dynamic imports), so we parse them as text and check they
// stay in sync with lib/data/page_info.json and lib/components/.

const root = path.resolve();
const pageInfo = JSON.parse(fs.readFileSync(root+"/lib/data/page_info.json","utf-8"));
const templatesSrc = fs.readFileSync(root+"/lib/client/templates.js","utf-8");
const componentsSrc = fs.readFileSync(root+"/lib/client/register-components.js","utf-8");

describe("page template registry",function(){

    // "index" is the page shell, served only by the server; virtual pages have
    // no template; aliases resolve to their target before lookup.
    const expectedPages = Object.keys(pageInfo).filter( name =>
        name !== "index" &&
        pageInfo[name].alias_for == null &&
        pageInfo[name].virtual !== true );

    // eager entries look like:  "name": require("../page-templates/....html")
    // lazy entries look like:   "name": () => import(... "../page-templates/....html")
    const entryRe = /"([\w-]+)":\s*(?:require\(|\(\)\s*=>\s*import\()[^)]*?"\.\.\/(page-templates\/[\w\/-]+\.html)"/g;
    const registered = {};
    var m;
    while((m = entryRe.exec(templatesSrc)) != null)
        registered[m[1]] = m[2];

    it("covers every real page in page_info.json",() =>{
        const missing = expectedPages.filter( name => registered[name] == null);
        expect(missing,"pages missing from templates.js maps: "+missing.join(", ")).to.be.empty;
    });

    it("has no entries for unknown pages",() =>{
        const extra = Object.keys(registered).filter( name => expectedPages.indexOf(name) === -1);
        expect(extra,"templates.js entries not in page_info.json: "+extra.join(", ")).to.be.empty;
    });

    it("points every entry at an existing template file",() =>{
        const broken = Object.keys(registered).filter( name =>
            ! fs.existsSync(root+"/lib/"+registered[name]));
        expect(broken,"entries with missing files: "+broken.join(", ")).to.be.empty;
    });

    it("respects the path prefix from page_info.json",() =>{
        const wrong = Object.keys(registered).filter( name => {
            const expected = "page-templates/"+(pageInfo[name].path || "")+name+".html";
            return registered[name] !== expected;
        });
        expect(wrong,"entries whose file doesn't match page_info path: "+wrong.join(", ")).to.be.empty;
    });
});

describe("component registry",function(){

    const allComponents = fs.readdirSync(root+"/lib/components")
        .filter( f => f.endsWith(".js"))
        .map( f => f.replace(/\.js$/,""));

    // eager: import * as x from '../components/NAME'
    const eager = [];
    const eagerRe = /from\s+'\.\.\/components\/([\w-]+)'/g;
    var m;
    while((m = eagerRe.exec(componentsSrc)) != null)
        eager.push(m[1]);

    // lazy: "NAME": () => import(... '../components/NAME')
    const lazy = [];
    const lazyRe = /"([\w-]+)":\s*\(\)\s*=>\s*import\([^)]*'\.\.\/components\/([\w-]+)'\)/g;
    while((m = lazyRe.exec(componentsSrc)) != null){
        lazy.push(m[1]);
        expect(m[1],"lazy key must match module filename").to.equal(m[2]);
    }

    it("accounts for every component module",() =>{
        const covered = eager.concat(lazy);
        const missing = allComponents.filter( c => covered.indexOf(c) === -1);
        expect(missing,"components in lib/components/ not registered anywhere: "+missing.join(", ")).to.be.empty;
    });

    it("registers each component exactly once",() =>{
        const dupes = eager.filter( c => lazy.indexOf(c) !== -1);
        expect(dupes,"components both eager and lazy: "+dupes.join(", ")).to.be.empty;
    });

    it("keeps components used by cold-entry pages eager",() =>{
        // components referenced as custom elements by the pages a visitor can
        // land on cold (server-rendered without client navigation)
        const coldTemplates = ["home","search","worker","not-found","page-error"]
            .map( p => root+"/lib/page-templates/"+p+".html");
        coldTemplates.push(root+"/lib/page-templates/index.html"); //the shell

        // transitive closure through eager component templates
        const needed = new Set();
        const queue = coldTemplates.slice();
        while(queue.length > 0){
            const file = queue.pop();
            if(!fs.existsSync(file)) continue;
            const html = fs.readFileSync(file,"utf-8");
            allComponents.forEach( c => {
                if(html.indexOf("<"+c) !== -1 && !needed.has(c)){
                    needed.add(c);
                    queue.push(root+"/lib/components/"+c+".html");
                }
            });
        }
        const lazyButNeeded = Array.from(needed).filter( c => eager.indexOf(c) === -1);
        expect(lazyButNeeded,"cold-entry pages use lazy components: "+lazyButNeeded.join(", ")).to.be.empty;
    });
});
