import {countryBound} from './google-map';
import * as utils from './client-utils';
import {getURLSlug,hydrateWikiPage} from '../shared/shared-utils';
import alertify from 'alertifyjs';

var Router = require('vanilla-router');

// Builds and returns the application router. `client` is the Client instance; the
// configured Router is also stored on `client.router`. Route handlers reach the rest
// of the app through `client` / `client.viewModel` at call time.
export function initRouter(client, {appBase, authBaseUrl, authClientID}){
    const viewModel=client.viewModel;
    const self=client;

    function setPage(pageName,pageFn){

        var _setPage = function(){

            console.log("======= SETTING PAGE TO "+pageName+"================",window.location.hash);
            viewModel.doTransition = false;
            let newPage = null;
            if(self.pageInfo[pageName] && self.pageInfo[pageName].title){
                //if current doc title does not match new page title, then perform a transition
                viewModel.doTransition = document.title !== self.pageInfo[pageName].title;
            }
            if(self.pageInfo[pageName].alias_for && self.pageInfo[self.pageInfo[pageName].alias_for]){
                newPage = self.getPage(self.pageInfo[pageName].alias_for).clone();
            }else{
                newPage = self.getPage(pageName).clone();
            }
            if(pageFn)
                pageFn(newPage);

            viewModel.page(newPage);

            if(self.pageInfo[pageName] && self.pageInfo[pageName].title){
                document.title = self.pageInfo[pageName].title;
            }

            try{

                //scroll to top of new page as long as no hash anchor link is present
                if( ! window.location.hash)
                    $("html, body").animate({ scrollTop: 0},500);
                else{
                    setTimeout(() =>{
                       console.log("found hash, scrolling to ", window.location.hash,$(window.location.hash));
                       var offset = $(window.location.hash).offset() || {top:0}
                       $("html, body").animate({ scrollTop: offset.top},500);
                    },1000);
                }
            }catch(error){
                console.warn("failed to scroll page: ",error);

            }
        }

        //new service worker found, so reload to use it
        if(viewModel.reloadOnNextNav === true ){
            viewModel.updateApp();
            //the above function should trigger a whole page reload.
            // but occasionally it fails to for some reason.
            // To ensure that doesn't lead to all page navigation being broken
            // we'll still set a page here, but after a delay
            setTimeout(() =>{
                console.warn("SW Reload did not occur after 500ms, setting next page");
                _setPage();
            },500);
        }else
            _setPage();


    }
    function setLoggedInPage(pageName,redirect,requiredRole){
        //console.log(`setting log-in required page ${pageName}. redirect: ${redirect}, required role: ${requiredRole}`,viewModel.roles());
        if(viewModel.loggedIn()){
            if(requiredRole == null || (requiredRole!=null && viewModel.hasRole(requiredRole)))
                setPage(pageName);
            else{
                console.warn(`required role ${requiredRole} not met for page ${pageName}`);
                setPage('not-found');
            }
        }else //if redirect not set, use pageName
            signInWithRedirect(redirect || pageName);
    }
    function setSearch(){
        //scroll to top before setting page so we don't trigger the infinite scroll function
        window.scrollTo(0,0);
        setPage("search");
    }

    // Helper to fetch a saved search by userKey and name, then load it into the search
    // This consolidates the duplicated logic used by two routes below.
    async function loadSavedSearchForUser(userKey, searchName){
        console.log("loadSavedSearchForUser userKey="+userKey+", searchName="+searchName);
        try{
            var savedSearch = await self.da.getSavedSearchesByName(userKey,searchName);
            if(savedSearch == null){
                throw "failed";
            }else{
                self.search.loadSavedSearch(savedSearch.data.params);
            }
        }catch(e){
            console.warn("could not find saved search "+searchName+(userKey?" for user "+userKey:"",e) );
            alertify.error("Well this is embarrassing, but I could not find a search saved under the name '"+searchName+"'");
        }
        setSearch();
    }
    const router = new Router({
        root:appBase,
        page404: function (path) {
            console.log('"/' + path + '" Page not found');
            viewModel.page(self.getPage("not-found"));
        }
    });
    client.router = router;

    router.add('', function () {
        setPage("home");
    });
    router.add('search/', async function () {
        console.log("bare search");
        setSearch();
    });
    router.add(/^search\/tag\/([^\/]+)$/, async function (tagName) {
        console.log("setting tag filter for tag name "+tagName);
        viewModel.appState.tagList.findItem( item => item.name.toLowerCase() === tagName.toLowerCase() ).
            then( item => {
                if(item != null)
                    viewModel.search.filter.tags.obs()([item.tag_key]);
                setSearch();
            })
    });
    router.add(/^search\/organization\/([^\/]+)$/, async function (orgName) {
        console.log("setting org filter for org name "+orgName);
        viewModel.appState.approvedOrgList.findItem(
                item => item.display_name.toLowerCase() === orgName.toLowerCase() ).
            then( item => {
                if(item != null)
                    viewModel.search.filter.organizations.obs()([item.organization_key]);
                setSearch();
            })
    });
    router.add("search/peopleGroupID/(:num)", async function (peopleID3) {
        viewModel.search.filter.peopleGroups.obs()([peopleID3]);
        setSearch();
    });
    router.add("search/countryCode/(:any)", async function (countryCode) {
        //console.log("searching by country code "+countryCode);
        var bound = await countryBound(countryCode);
        if(bound != null){
           //console.log("setting bound for country "+countryCode);
           viewModel.search.filter.bounds.obs()([
              bound.northeast.lat,
              bound.northeast.lng,
              bound.southwest.lat,
              bound.southwest.lng
            ]);
            viewModel.search.searchResultsTemplate("map-results-template");
        }
        setSearch();
    });
    router.add(/^search\/public\/([-a-zA-Z0-9"' ]+)$/, async function (searchName) {
        console.log("loading public search "+searchName);

        try{
            var savedSearch = await self.da.getPublicSearch(searchName);

            if(savedSearch == null) throw "failed";

            console.log("loading public search ",savedSearch);
            self.search.loadSavedSearch(savedSearch.data.params);

        }catch{
            console.warn("could not find public search "+searchName);
            alertify.error("Well this is embarrassing, but I could not find a search saved under the name '"+searchName+"'");
        }
        setSearch();
    });
    // Route: /search/saved/<user_key>/<searchName>
    // If a user_key is supplied in the URL we allow viewing that saved search
    // without requiring the current user to be logged in.
    router.add(/^search\/saved\/([^\/]+)\/([-a-zA-Z0-9"' ]+)$/, async function (userKey, searchName) {
        console.log("loading saved search for user "+userKey+" name "+searchName);
        await loadSavedSearchForUser(userKey, searchName);
    });

    // Existing route: /search/saved/<searchName> (requires login)
    router.add(/^search\/saved\/([-a-zA-Z0-9"' ]+)$/, async function (searchName) {
        console.log("loading saved search "+searchName);

        if(viewModel.loggedIn()){
            var userKey = viewModel.loggedInUser().user_key();
            await loadSavedSearchForUser(userKey, searchName);
        }else{
           console.log("saved searches require login first, redirecting");
            signInWithRedirect("search/saved/"+searchName);
        }

    });
    router.add(/^search\/([-a-zA-Z0-9"' ]+)$/, async function (query) {
        console.log("query search : "+query);
        self.search.setQuery(query);
        setSearch();
    });
    router.add('profile/edit/(:num)', async function (missionary_profile_key) {
        console.log("nav2 to profile/edit",missionary_profile_key,viewModel.roles());
        if(viewModel.loggedIn() && viewModel.hasRole("profile_manager") ){
            try{
                const profile = await self.da.getProfileByKey(missionary_profile_key);
                viewModel.editingProfile(ko.mapping.fromJS(profile))
                setPage('profile');
            }catch(e){
                setPage('not-found');
            }
        }else
            setPage('not-found');
    });
    router.add('profile/preview/(:num)', async function (missionary_profile_key) {
        console.log("nav3 to profile/preview",missionary_profile_key,viewModel.roles());
        //if(viewModel.loggedIn() && viewModel.hasRole("profile_manager") ){
        if(viewModel.loggedIn()){
            try{
                const profile = await self.da.getDisplayProfilePreviewByKey(missionary_profile_key);
                viewModel.selectedProfile(profile);
                setPage('profile-detail');
            }catch(e){
                setPage('not-found');
            }
        }else
            setPage('not-found');
    });
    router.add('profile/new', async function () {
        console.log("nav to profile/new",viewModel.roles());
        if(viewModel.loggedIn() && viewModel.hasRole("profile_manager") ){
            await viewModel.newProfileSetup();
            setPage('profile');
        }else
            setPage('not-found');
    });
    router.add('profile/', async function () {
        if(viewModel.loggedIn()){
            let managedProfiles;
            if( ! await self.isUserVerified()){
                //reset this value
                self.viewModel.verifyEmailSent(false);
                setPage("verify-email");
                //self.router.navigateTo("verify-email"); //messes up back button
            } else if( (managedProfiles = await self.server.authPostJson("/api/getManagedProfiles")) && managedProfiles.length > 1){
                // linked to more than one profile: let them choose which to manage
                self.router.navigateTo("dashboard/managed-profiles-list");
            } else if( ! viewModel.hasProfile() && ! viewModel.termsConfirmed()){
                await viewModel.loadProfile(viewModel.loggedInUser().user_key());
                setPage("confirm-sof");
            } else if( ! viewModel.hasProfile() &&  viewModel.termsConfirmed()){
                console.log("no profile, but sof confirmed",viewModel.userProfile())
                await viewModel.loadProfile(viewModel.loggedInUser().user_key());
                viewModel.editingProfile(viewModel.userProfile());
                setPage("profile");
            }else{
                console.log("has profile, and sof confirmed",viewModel.userProfile())
                viewModel.editingProfile(viewModel.userProfile());
                setPage("profile");
            }
        }else
            signInWithRedirect("profile"+location.hash.replaceAll("#","%23"));
    });
    router.add('verify-email/', async function () {
        //reset this value
        self.viewModel.verifyEmailSent(false);
        setPage("verify-email");
    });

    router.add('get-started/', function (name) {
        setPage("get-started");
    });
    router.add('profile-detail/(:num)', async function (missionary_profile_key) {
        var profile;
        try{
            profile = await self.da.getDisplayProfileByKey(missionary_profile_key);
            console.log("found profile; ",profile);
            if(profile.data && profile.data.profile_slug){
                // redirect to worker URL
                self.router.navigateTo('worker/'+profile.data.profile_slug);
                return;
            }
            // no slug, load the page
            viewModel.selectedProfile(profile);
            setPage("profile-detail");
            document.title = "Ergatas Profile - "+profile.missionary_name;
        }catch(error){
            console.error("no profile found for missionary_profile_key",missionary_profile_key+". "+error.message,error);
            setPage("not-found");
        }
    });
    router.add('worker/(:any)', async function (slug) {
        console.log("worker slug route: "+slug);
        try{
            const profile = await self.da.getProfileBySlug(slug);
            if(profile != null){

                viewModel.selectedProfile(profile);
                setPage("profile-detail");
            }else{
                setPage('not-found');
            }
        }catch(error){
            console.error("failed to find profile for slug "+slug, error);
            setPage('not-found');
        }
    });
    router.add('about/', function () {
        setPage("about");
    });
    router.add('resources/', function () {
        setPage("resources");
    });
    router.add('contact/', function () {

        var message= utils.getURLParameter("message");
        viewModel.pageParameters.message = message;
        viewModel.contactMessageSent(false);
        setPage("contact");
    });
    router.add('org-application/', async function () {
        setLoggedInPage("org-application");
    });
    router.add(/^signIn\/(.+)$/, function (redirectPage) {
        console.log("sign in with redirect",viewModel.loginURL);
        signInWithRedirect(redirectPage);
    });
    router.add('signOut/', function () {
        window.location=authBaseUrl+"/logout?client_id="+authClientID;
    });
    router.add('confirm-sof/', async function () {

        if( ! await self.isUserVerified()){
            self.router.navigateTo("verify-email");
        }else
            setPage("confirm-sof");
    });
    router.add('organization-review/(:num)', function (organization_key) {
        setLoggedInPage('organization-review',null,'organization_review');
    });
    router.add('organization-review/', function () {
        setLoggedInPage('organization-review',null,'organization_review');
    });
    router.add('reports/', function () {
        setLoggedInPage('reports',null,'organization_review');
    });
    router.add('message-moderation/', function () {
        setLoggedInPage('message-moderation',null,'organization_review');
    });
    router.add('dashboard/{name}', function (name) {
        setLoggedInPage('dashboard');
    });
    router.add('learn/{name}', function (name) {
        console.log("loading learn article "+name);
        setPage(name);
    });
    router.add('org/{name}', async function (name) {
        console.log("checking to see if "+name+" is an org slug");
        const org = await self.da.getOrganizationBySlug(name);
        if(org != null){
            console.log("it is a slug! ",JSON.stringify(org));
            self.viewModel.portalOrg(org);
            setPage("organization");
        }else
            setPage('not-found')

    });

    router.add(/([^./]+)$/, async function (name) {
        console.log("default handler, attempting to load "+name);
        if(self.pageExists(name)){
            const pageInfo = self.pageInfo[name];
            console.log("page info: ",pageInfo);
            if(pageInfo.auth != null && pageInfo.auth === true)
                setLoggedInPage(name);
            else
                setPage(name);
        }else {
            //see if its a wiki page
            let slug = getURLSlug();
            const page = await self.da.getPageBySlug(slug);
            if(page != null){
                console.log("found wiki page for slug "+slug, page);
                setPage("wiki-page",(doc)=> hydrateWikiPage(jQuery,page.data,doc));
            }else
                setPage('not-found')
        }
    });

    router.addUriListener();
    function signInWithRedirect(redirectPage){
        console.log("signIn with redirect to "+redirectPage);
        window.location=viewModel.loginURL+"&state="+redirectPage;
    }

    return router;
}
