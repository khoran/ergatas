import chai from 'chai';
import fs from 'fs';
import path from 'path';
import http from 'http';
const expect = chai.expect;

// AEO (AI engine optimization) surface tests: llms.txt generation, FAQPage
// JSON-LD on the about page, and the prerendered worker-profile summary.
// Worker pages need the DB, so a minimal fake PostgREST server is stood up
// and POSTGREST_SERVER_URL_BASE pointed at it before utils.js is imported.

const root = path.resolve();
const pageInfo = JSON.parse(fs.readFileSync(root+"/lib/data/page_info.json","utf-8"));

const testProfile = {
    missionary_profile_key: 42,
    missionary_name: "Test Worker",
    profile_slug: "test-worker",
    data: {
        organization_key: 7,
        location: "Nairobi, Kenya",
        description: "<p>We serve in <b>East Africa</b> translating scripture.</p><p>Second paragraph here.</p>",
        picture_url: "",
    }
};
const testOrg = { organization_key: 7, display_name: "Test Mission Agency" };

function extractJsonLd(html){
    return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
        .map( m => JSON.parse(m[1]));
}

describe("AEO features",function(){

    var utils;
    var fakeDb;
    var prevPostgrestBase;
    var limitSocialMedia = false;

    before(async function(){
        prevPostgrestBase = process.env.POSTGREST_SERVER_URL_BASE;
        fakeDb = http.createServer((req,res) => {
            const profile = JSON.parse(JSON.stringify(testProfile));
            profile.data.limit_social_media = limitSocialMedia;
            res.setHeader("Content-Type","application/json");
            if(req.url.startsWith("/all_profile_search"))       //profileSlugExists
                res.end(JSON.stringify([profile]));
            else if(req.url.startsWith("/profile_search"))      //getProfileBySlug (single)
                res.end(JSON.stringify(profile));
            else if(req.url.startsWith("/non_profit_and_organizations_view")) //getOrganization (single)
                res.end(JSON.stringify(JSON.parse(JSON.stringify(testOrg))));
            else {
                res.statusCode = 404;
                res.end("[]");
            }
        });
        await new Promise( resolve => fakeDb.listen(0,resolve));
        process.env.POSTGREST_SERVER_URL_BASE = "http://127.0.0.1:"+fakeDb.address().port;
        process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
        process.env.DOMAIN = process.env.DOMAIN || "ergatas.org";
        utils = await import('../lib/server/utils.js');
    });
    after(function(){
        fakeDb.close();
        if(prevPostgrestBase === undefined) delete process.env.POSTGREST_SERVER_URL_BASE;
        else process.env.POSTGREST_SERVER_URL_BASE = prevPostgrestBase;
    });

    describe("llms.txt",function(){
        var text;
        var base;
        before(function(){
            text = utils.llmsTxt(pageInfo);
            base = "https://" + process.env.DOMAIN;
        });

        it("starts with the site name and a summary blockquote",() =>{
            expect(text).to.match(/^# Ergatas\n\n> /);
        });
        it("lists learn and docs articles with absolute urls",() =>{
            expect(text).to.include(`(${base}/learn/how-does-missionary-support-work)`);
            expect(text).to.include(`(${base}/docs/dashboard-overview)`);
        });
        it("excludes non-indexed pages",() =>{
            expect(text).to.not.include(`(${base}/verify-email)`);
            expect(text).to.not.include(`(${base}/dashboard)`);
            expect(text).to.not.include(`(${base}/guided-search)`);
        });
        it("links the sitemap",() =>{
            expect(text).to.include(`${base}/sitemap.xml`);
        });
    });

    describe("about page FAQPage JSON-LD",function(){
        var faq;
        before(async function(){
            const html = await utils.buildIndex("about",Object.assign({},pageInfo["about"]),"/about");
            faq = extractJsonLd(html).find( o => o["@type"] === "FAQPage");
        });

        it("emits a FAQPage with the accordion questions",() =>{
            expect(faq,"no FAQPage JSON-LD emitted").to.exist;
            expect(faq.mainEntity).to.have.lengthOf.at.least(10);
        });
        it("has non-empty text answers on every question",() =>{
            faq.mainEntity.forEach( q => {
                expect(q["@type"]).to.equal("Question");
                expect(q.name).to.not.be.empty;
                expect(q.acceptedAnswer.text).to.not.be.empty;
            });
        });
        it("skips the audio-only pronunciation card",() =>{
            const names = faq.mainEntity.map( q => q.name);
            expect(names.find( n => /pronounce/i.test(n))).to.be.undefined;
        });
    });

    describe("verse landing page prerender",function(){
        var html;
        before(async function(){
            html = await utils.buildIndex("matthew-28",
                Object.assign({},pageInfo["matthew-28"]),"/learn/matthew-28");
        });
        it("server-renders the verse text into the initial HTML (crawlable)",() =>{
            expect(html).to.match(/go and make disciples of all nations/i);
        });
        it("server-renders every translation so all are crawlable",() =>{
            //KJV wording differs from NIV/ESV; presence proves all tabs are prerendered
            expect(html,"KJV text missing").to.match(/Go ye therefore, and teach all nations/i);
        });
    });

    describe("learn page FAQPage JSON-LD",function(){
        var faq;
        before(async function(){
            const html = await utils.buildIndex("christian-crowdfunding",
                Object.assign({},pageInfo["christian-crowdfunding"]),"/learn/christian-crowdfunding");
            faq = extractJsonLd(html).find( o => o["@type"] === "FAQPage");
        });

        it("emits a FAQPage from the learn-faq accordion",() =>{
            expect(faq,"no FAQPage JSON-LD emitted for learn page").to.exist;
            expect(faq.mainEntity).to.have.lengthOf.at.least(2);
        });
        it("includes the GoFundMe comparison question with a text answer",() =>{
            const q = faq.mainEntity.find( q => /GoFundMe/i.test(q.name));
            expect(q,"expected a 'different from GoFundMe' question").to.exist;
            expect(q.acceptedAnswer.text).to.not.be.empty;
        });
    });

    describe("home page structured data",function(){
        it("includes an Organization with a description",async () =>{
            const html = await utils.buildIndex("home",Object.assign({},pageInfo["home"]),"/");
            const org = extractJsonLd(html).find( o => o["@type"] === "Organization");
            expect(org).to.exist;
            expect(org.description).to.match(/missionaries/);
        });
    });

    describe("worker profile prerender",function(){
        var html,jsonLd;
        before(async function(){
            limitSocialMedia = false;
            html = await utils.buildIndex("worker",Object.assign({},pageInfo["worker"]),"/worker/test-worker");
            jsonLd = extractJsonLd(html);
        });

        it("injects a crawler-readable summary into #page_content",() =>{
            expect(html).to.include("<h1>Test Worker</h1>");
            expect(html).to.include("Test Mission Agency");
            expect(html).to.include("Nairobi, Kenya");
            expect(html).to.include("We serve in East Africa translating scripture.");
            expect(html).to.include("Second paragraph here.");
        });
        it("does not inject the raw description html",() =>{
            expect(html).to.not.include("<b>East Africa</b>");
        });
        it("uses the profile description as the meta description",() =>{
            expect(html).to.match(/<meta name="description" content="We serve in East Africa translating scripture\./);
        });
        it("emits an enriched Person in the ProfilePage schema",() =>{
            const page = jsonLd.find( o => o["@type"] === "ProfilePage");
            expect(page).to.exist;
            const person = page.mainEntity;
            expect(person.name).to.equal("Test Worker");
            expect(person.description).to.include("East Africa");
            expect(person.worksFor.name).to.equal("Test Mission Agency");
            expect(person.homeLocation.name).to.equal("Nairobi, Kenya");
        });
        it("emits a BreadcrumbList ending at the profile",() =>{
            const crumbs = jsonLd.find( o => o["@type"] === "BreadcrumbList");
            expect(crumbs).to.exist;
            const last = crumbs.itemListElement[crumbs.itemListElement.length-1];
            expect(last.name).to.equal("Test Worker");
            expect(last.item).to.equal("https://"+process.env.DOMAIN+"/worker/test-worker");
        });

        it("injects nothing and noindexes when the profile limits social media",async () =>{
            limitSocialMedia = true;
            const limited = await utils.buildIndex("worker",Object.assign({},pageInfo["worker"]),"/worker/test-worker");
            limitSocialMedia = false;
            expect(limited).to.not.include("<h1>Test Worker</h1>");
            expect(limited).to.include("noindex");
            expect(extractJsonLd(limited).find( o => o["@type"] === "ProfilePage"),
                "no structured data should be emitted for noindexed profiles").to.be.undefined;
        });
    });
});
