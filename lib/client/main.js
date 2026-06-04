import * as utils from './client-utils';
import Logger from '../shared/logging';
import {DataAccess} from '../shared/data-access';
import {urlBase64ToUint8Array} from '../shared/shared-utils';
import { registerComponents } from './register-components';
import * as thirdParty from './third-party';
import * as templates from './templates';
import * as pwa from './pwa';
import * as session from './session';
import { createViewModel } from './view-model';
import { initRouter } from './router-setup';
import alertify from 'alertifyjs';
import { ServerAPI } from './server-api';
import { CloudStorage } from '../server/cloud-storage';
import { Search } from './search';
import { AppState } from '../server/app-state';

console.log("main starting4");

class Client {

constructor(){
    const self=this;
    var code,state;
    const bucketName = process.env.UPLOAD_BUCKET ;
    const bucketBaseUrl= process.env.BUCKET_BASE_URL;
    const authClientID=process.env.AUTH_CLIENT_ID
    const authRedirect=process.env.REDIRECT_URL;
    const postgrestBase= process.env.POSTGREST_URL_BASE;
    const authBaseUrl=process.env.AUTH_URL_BASE;
    const appBase=process.env.APP_BASE || '/';
    const logKey = process.env.LOG_KEY;
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const bucketBase=bucketBaseUrl+"/"+bucketName+"/";

    ko.options.deferUpdates = true;

    this.guidedSearchName = "Guided Search Profile";
    this.version = process.env.PACKAGE_VERSION;
    this.domain =  process.env.DOMAIN;
    this.maintenance_mode = process.env.MAINTENANCE_MODE ==="true" ;
    this.router;
    this.viewModel;
    this.pageInfo; //initialized by initTemplates
    this.server = new ServerAPI();
    this.storage = new CloudStorage(bucketBase);

    this.convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

    console.info(" VERSION: "+this.version+", maintenance mode: "+this.maintenance_mode);

    //this will replace console.{log,info,error,warn} with remote logging
    new Logger((buffer) => {
        return self.server.postJson("/api/log",{
            key: logKey,
            logs:buffer
        });
    });

    thirdParty.initTagManager();


    this.da = new DataAccess(postgrestBase,jQuery.ajax, function(){return self.server.refreshToken();});
    this.search = new Search(appBase,this.da);
    this.server.token.subscribe((newToken) =>{
        //update da whenever the token is refreshed
        console.log("setting new JWT token in da after token obs update");
        self.da.setToken(newToken);
    });


    registerComponents();

    alertify.defaults.notifier.delay=15;
    alertify.defaults.notifier.position="top-center";
    alertify.defaults.transition="zoom";
    templates.initTemplates(this);
    this.getPage = (name) => templates.getPage(this,name);
    this.pageExists = (name) => templates.pageExists(this,name);
    this.getSnippet = (name) => templates.getSnippet(this,name);

    // Re-attach PWA helpers onto the instance so viewModel/router/start() callers resolve.
    this.registerPushSubscription = () => pwa.registerPushSubscription(this);
    this.setSubscriptionStatus = (obs) => pwa.setSubscriptionStatus(this,obs);
    // Re-attach so the router (profile/, confirm-sof/) can call client.isUserVerified().
    this.isUserVerified = () => session.isUserVerified(this);


    //console.warn("+++++++++  mode: "+process.env.NODE_ENV+"  +++++++++++++++++++++++");


    this.appState = new AppState(self.da,self.search,self.storage,self.router,self.server);
    this.viewModel = createViewModel(this,{authBaseUrl, clientId:authClientID, redirect:authRedirect, appBase, appState:this.appState});
    this.appState.loggedInUser = this.viewModel.loggedInUser;
    this.router = initRouter(this,{appBase, authBaseUrl, authClientID});
    this.appState.setRouter(this.router);

    pwa.registerServiceWorker(this);
    pwa.setupPWA(this);

    var code = utils.getURLParameter("code");
    var state= utils.getURLParameter("state") || window.location.pathname.replace(appBase,"")  ;
    var hash= window.location.hash;
    var doNavigate=jQuery("#page_content").children().length == 0;

    if(document.getElementById("is_search_page") != null){
        console.log("adding "+state+"as a search page");
        this.search.searchPages.push(state); //add current page as a search page
    }

    console.log("navigate?: ",doNavigate);
    console.log("code: "+code+", state: "+state+", hash: "+hash);


    ////some paths require more processing than the server can perform. Those
    //// paths generally have additional path components.
    //// So we look for them here, and if we find one, we navigate again to that
    //// page to trigger the required javascript processing.
    //// If the page_content section is empty, some error
    //// prevented the server from filling it in. In that case, we always
    //// trigger a navigation.

    //// no navigation for single-component paths  and prerender was true (page_content filled in)
    //// navigate for prerender false, or multi-component paths

    //console.log("state has no /: ",state.indexOf("/") === -1);
    //console.log("page content length: "+jQuery("#page_content").children().length, jQuery("#page_content"));
    //if(state.indexOf("/") === -1 &&  jQuery("#page_content").children().length > 0 ) //state is just one path component
    //    doNavigate=false; //we assume the server will have filled in required page, so we don't do any navigation here



    //do a test login here to see if  have a cookie that will keep us logged in
    // also, encrypt the cookies

    if(code){
        session.doLogin(this, state ,code);
    }else{ //see if we can log user in based on refresh_token in cookie
        session.doRefresh(this).then(() =>{
            if(doNavigate){
                self.router.check();
            }
        });
    }

    session.handleDonationResult(this);

}
start(){


    //console.warn(" ============================== BINDINGS APPLIED =========================",(new Date()) - window.performance.timing.navigationStart);
    ko.applyBindings(this.viewModel);

    this.setSubscriptionStatus(this.viewModel.isSubscribed);

    setTimeout(() =>{
        jQuery.getScript("https://www.google.com/recaptcha/api.js?render=6LdotL0ZAAAAALDh_JBTO_JC-CF4ZnSysamIHV3c").
            then(()=>{
                this.server.sendRecaptcha("initial_page_load");
            })
        //thirdParty.initChatra();
    },5000);
}


} // end Client class


export default {Client};
