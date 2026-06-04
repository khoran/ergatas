import {AppError} from '../server/app-error';
import * as utils from './client-utils';
import alertify from 'alertifyjs';

// Authentication / session lifecycle: login, token refresh, post-login guided-search
// persistence, email-verification check, debug cookies, and donation-return handling.
// Each function receives the Client instance as `client`.

export function handleDonationResult(client){
    var checkoutSessionId= utils.getURLParameter("session_id");
    console.log("resumeCheckout. id: "+checkoutSessionId);
    if(! checkoutSessionId )
        return;

    client.server.authPostJson("/api/checkoutSessionStatus",{
        checkoutSessionId: checkoutSessionId
    }).then( result =>{
        console.log("checkout status: ",result);
        if(result.status === "open"){ //re-display checkout form
            alertify.error("Oops, something went wrong while processing your donation. Please try your donation again.")
        }else if(result.status === "complete"){ //checkout completed, show thank you message
            alertify.success("Thank you for your contribution!");
        }

        //clear this parameter from the location bar so users don't reload it
        history.pushState({},'',location.origin+location.pathname);
    });

    // check for donation status
    //var donationResult = utils.getURLParameter("donationResult");
    //if(donationResult==="failed"){
    //    console.warn("got failed donation result");
    //    alertify.error("Oops, something when wrong while processing your donation. But have no fear, we'll get it fixed in a jiffy! Please check back later.")
    //}else if(donationResult==="success"){
    //    alertify.success("Thank you for your contribution!");
    //}
    //if(donationResult != null)
    //    history.pushState({},'',location.origin+location.pathname);


}

export async function isUserVerified(client){
    try{
        const result = await client.server.authPostJson("/api/verifyUser");
        console.log("verify result: ",result,result != null && result.verified === true);
        return result != null && result.verified === true;
    }catch(error){
        console.error("failed to check if user is verified: "+error.message,error);
        return false;
    }
}

export async function doRefresh(client){
    var self=client;
    try{
        var tokenResult = await self.server.refreshToken();
        self.viewModel.roles(tokenResult.roles);
        setCookies(self);

        if( ! self.viewModel.loggedIn()){
            console.log("reloading user during refresh");
            var userResults = await self.da.getUser(tokenResult.userId);
            if(userResults.length === 1){
                console.log("logged in user: ",userResults[0]);
                dataLayer.push({event:'user','user-action':"login","user_id":tokenResult.userId});
                var user = userResults[0];
                user.email= tokenResult.email; //not saved, just displayed on page
                self.viewModel.loggedInUser(ko.mapping.fromJS(user));
                self.viewModel.termsConfirmed(self.viewModel.loggedInUser().agreed_to_sof());
                self.viewModel.termsConfirmedCheckBox(self.viewModel.termsConfirmed());
            }
        }

        if( ! self.viewModel.hasProfile()){
            console.log("reloading profile during refresh");
            await self.viewModel.loadProfile(self.viewModel.loggedInUser().user_key());
        }
    }catch(error){
        console.info("failed to refresh login. "+(error.responseJSON && error.responseJSON.message));
    }
    console.log("token refresh done");
}

export async function doLogin(client,state,code){
    const self=client;
    const viewModel=self.viewModel;
    var userResults, user;

    console.log("attempting login");
    try{
        var tokenResult = await self.server.postJson("/api/token",{code:code});
        var newUser=false;
        //console.log("token result: ",tokenResult);
        if(tokenResult.access_token != null){
            console.info("login authenticated");
            //self.updateToken(tokenResult);
            self.server.token(tokenResult.access_token);
            self.viewModel.roles(tokenResult.roles);

            self.server.sendRecaptcha("login");
            dataLayer.push({event:'user','user-action':"login","user_id":tokenResult.userId});
            try{
                userResults = await self.da.getUser(tokenResult.userId);
                console.log("userResults: ",userResults);
                if(userResults.length === 1){
                    console.log("logged in user: ",userResults[0]);
                    user = userResults[0];
                }else{ //user not found
                    newUser=true;
                    user = await self.da.createUser(tokenResult.userId);
                    dataLayer.push({event:'user','user-action':"created","user_id":tokenResult.userId});
                    console.log(" new user record: ",user);
                    try{
                        await self.server.authPostJson("/api/newUser");
                    }catch(error){ //not fatal, make sure any errors from this don't propagate
                        console.warn("failed to post to newUser endpoint: "+error.message,error);
                    }
                }

                try{
                    await persistSavedGuidedSearch(self,user);
                }catch(error){ //not fatal, make sure any errors from this don't propagate
                    console.warn("failed to check for or persist locally saved guided search: "+error.message,error);
                }
                user.email= tokenResult.email; //not saved, just displayed on page
                viewModel.loggedInUser(ko.mapping.fromJS(user));
                self.viewModel.termsConfirmed(self.viewModel.loggedInUser().agreed_to_sof());
                self.viewModel.termsConfirmedCheckBox(self.viewModel.termsConfirmed());
                setCookies(self);

                await viewModel.loadProfile(viewModel.loggedInUser().user_key());

                if(newUser)
                    self.router.navigateTo("confirm-sof");
                else
                    self.router.navigateTo(state);

            }catch(error){
                throw new AppError("failed to create new user with userId "+tokenResult.userId+". "+error.message,error);
            }
        }else{
            throw new AppError("no access_token found in tokenResult");
        }
    }catch(error){
        alertify.error("Login Failed");
        console.error("failed to log in user. "+error.message,error);
        self.router.navigateTo('');
    }
}


export async function persistSavedGuidedSearch(client,user){
    //look to see if there is a locally stored guided search and no guided search in db
    //  then grab it and store it, then remove the local entry

    console.log("checking for a local guided search with name "+client.guidedSearchName);
    var name = client.guidedSearchName;
    var searchParams= window.localStorage.getItem(name);
    console.log("search params: ",searchParams);

    if(searchParams == null)
        return;

    try{
        var savedSearch = await client.da.getSavedSearchesByName(user.user_key,name)
        if(savedSearch != null)
            //if we have a db search already, then just remove this local one
            window.localStorage.clear(name);
            return;
    }catch{ //we'll come here if the above search fails to find anything
        try{

            var data = {
                name:name,
                params: JSON.parse(searchParams)
            }
            console.log("found a local guided search, saving to db");
            await client.da.createSavedSearch(user.user_key,data);
            user.has_saved_search=true;
        }catch(error){
            console.error("failed to persist locally saved search",error);
        }
    }
}

export function setCookies(client){
    if(client.viewModel.hasRole("debugger")){
        document.cookie = "debugmode=true;max-age="+(60*60*24);
        console.log("DEBUG MODE ON");
    }
}
