import axios from 'axios';
import path from 'path';
import Mailgun from 'mailgun-js';
import jwt  from 'jsonwebtoken';
import { AppError } from './app-error.js';
import crypto from 'crypto';
import { DataAccess } from '../shared/data-access.js';
import fs from 'fs';
import {ListMonk} from './listmonk.js';
import cheerio from "cheerio";
import serveStatic from 'serve-static';
import { BlobServiceClient } from '@azure/storage-blob';
import {getProfilesForFilter} from '../shared/shared-utils.js';
import webPush  from 'web-push';
import {BetaAnalyticsDataClient} from '@google-analytics/data';
import * as stripeUtils from './stripe_utils.js';

var mailgun;
export var mailingList;

export const messagingAdminEmail = "messaging-admin@ergatas.org";

export function init(){
    //mailingList = new VRMailingList(process.env.VR_ACCESS_TOKEN,process.env.VR_SERVER_URL);
    mailingList = new ListMonk(process.env.LISTMONK_USERNAME,
                               process.env.LISTMONK_PASSWORD,
                               process.env.LISTMONK_SERVER_URL )
}


function getMailgun(){
    if(mailgun == null){
        const api_key = process.env.MAILGUN_API_KEY;
        const domain = process.env.MAILGUN_DOMAIN;
        if(api_key == null || api_key === '')
            throw new AppError("no api_key defined for Mailgun");
        if(domain == null || domain === '')
            throw new AppError("no domain defined for Mailgun");

        mailgun = Mailgun({apiKey: api_key, domain: domain});
    }
    return mailgun;
}
export function sendEmail(data){
    return new Promise((resolve,reject) =>{

        getMailgun().messages().send(data,(error,body) =>{
            if(error != null){
                reject(error);
            }else{
                resolve(body);
            }
        });
    });
}

function fusionRequest(type,path,data,headers){
    const fusionUrl= process.env.FUSION_BASE_URL;
    const key = process.env.FUSION_USER_INFO_KEY;

    if(headers == null)
        headers = {};

    headers["Authorization"] = key;

    return axios({
        method: type,
        url: fusionUrl+path,
        data: data,
        headers: headers,
    });

}
export function loginDataFromToken(token){
    
    const payload = jwtPayload(token);
    //console.log("token payload: ",payload);

    return {
        access_token: token,
        roles: payload.roles,
        email: payload.email,
        userId: payload.sub,
        expires: payload.exp,
    };
}
export function jwtPayload(token){
    const secret = process.env.JWT_SECRET;
    //console.local("token:",token);
    if(secret == null || secret==="")
        throw new AppError("no secret given, cannot verify JWT");

    return jwt.verify(token,secret);

}
export async function getJWT(code){

    const authTokenUrl= process.env.AUTH_TOKEN_URL_BASE;
    const redirectUrl = process.env.REDIRECT_URL || "localhost";
    const authClientId= process.env.AUTH_CLIENT_ID;

    if(code == null || code === ""){
        throw new AppError("no code given");
    }

    return axios.post(authTokenUrl,
        "grant_type=authorization_code&"+
        "client_id="+authClientId+"&"+
        "code="+code+"&"+
        "redirect_uri="+redirectUrl
    ,{
        headers: {
            "Content-Type":"application/x-www-form-urlencoded",
        }
    }).then((response)=>{
        //console.local("login data: ",response.data);
        return {
            refresh_token: response.data.refresh_token,
            clientData: loginDataFromToken(response.data.access_token)
        };
    }).catch((error) =>{
        console.error("caught error: ",error);
        throw error;
    });

};
export async function refreshJWT(refresh_token){
    const authTokenUrl= process.env.AUTH_TOKEN_URL_BASE;
    const authClientId= process.env.AUTH_CLIENT_ID;

    return axios.post(authTokenUrl,
        "grant_type=refresh_token&"+
        "client_id="+authClientId+"&"+
        "refresh_token="+refresh_token
    ,{
        headers: {
            "Content-Type":"application/x-www-form-urlencoded",
        }
    }).then((response)=>{
        return loginDataFromToken(response.data.access_token);
    });

}
export function requireRole(req,role){

    const payload = jwtPayload(req.body.token);
    if(payload == null || payload.roles == null || ! payload.roles.includes(role))
      throw new AppError("Not authorized");

}
export function getDB(token) {
    const postgrestBase= process.env.POSTGREST_SERVER_URL_BASE;
    const secret = process.env.JWT_SECRET;
    if(token == null){

        token = jwt.sign({
                role: 'ergatas_server',
                roles:['ergatas_server']
            },secret,{ expiresIn: 60 })
    }
    
    //const db = new DataAccess(postgrestBase,axios);
    const db = new DataAccess(postgrestBase, async (requestData) =>{
        try{
            const response = await axios(requestData)
            //console.log("DB response: ",response);
            if(response.data != null && response.status >= 200 && response.status < 300)
                return response.data;
            else
                //console.log("DB ERROR: ",response);
                throw new AppError("DB request failed with status "+response.status+", "+response.statusText);
        }catch(error){
            //console.log("DB ERROR: ",error);
            var message;
            if(error.response){
                const r=error.response;
                if(r.status === 401) //auth token bad or expired
                    throw new jwt.TokenExpiredError
                message = `status: ${r.status}, ${r.statusText}. ${r.config.url} data: ${JSON.stringify(r.data,' ')}`;
            }else
                message = error;
            throw new AppError("DB request failed: "+message);
        }
    });
    db.setToken(token);
    return db;
}


export async function fixBlobMimeTypes() {

    //const uploadBucketName = process.env.UPLOAD_BUCKET ;
    const uploadBucketName = "ergatas-public-content";
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const bucket = blobServiceClient.getContainerClient(uploadBucketName);

    
    var i=0;
    for await (const blob of bucket.listBlobsFlat()) {
        i=i+1;
        //console.log(`name: ${blob.name}, content-type: `,blob.properties.contentType);
        if(blob.properties.contentType==="application/octet-stream"){

            //if( ! blob.name.endsWith("Butlers-in-Europe-2017.jpg"))
                //continue;

            console.log("fixing "+blob.name);

            var blockBlob = bucket.getBlockBlobClient(blob.name);
            var httpOptions = {
                blobContentMD5: blob.properties.contentMD5,
            };

            if(blob.name.match(/\.(jpg|jpeg)$/i)){
                console.log("found jpg");
                httpOptions.blobContentType= 'image/jpeg';
            }else if(blob.name.match(/\.png$/i)){
                console.log("found png");
                httpOptions.blobContentType= 'image/png';
            }else{
                continue;
            }

            //console.log("options: ",httpOptions);
            blockBlob.setHTTPHeaders(httpOptions);

        }
    }
    console.log("found "+i+" blobs");

}



function checkProfileBucketPermissions(userId,missionary_profile_key){
    console.log("checking profile bucket permissions ",userId, missionary_profile_key);
    if(missionary_profile_key == null){
        console.log("using userId");
        return userId;
    }else if(userHasPermissionOnProfile(userId, missionary_profile_key)){ // use MPK prefix
        console.log("using mpk prefix");
        return "MPK"+missionary_profile_key;
    }else{  //not permitted
        console.error("file not deleted for user "+userId+", either no profile key given, or user not authorized");
        return null;
    }
}
export async function removeFile(userId,filename,missionary_profile_key=null){
    const bucket = getUploadBucket();
    const prefix = checkProfileBucketPermissions(userId,missionary_profile_key);
    return bucket.deleteBlob(prefix+"/"+filename);
}
export async function removeAllFiles(userId,missionary_profile_key=null){
    const bucket = getUploadBucket();
    const prefix = checkProfileBucketPermissions(userId,missionary_profile_key);
    var files = await getUserBucketFiles(prefix);
    return Promise.all(files.map( (file) =>{
        return bucket.deleteBlob(file.name);
    }));
}
export async function getUserBucketFiles(prefix,bucket) {
    const userBucket = bucket || getUploadBucket();
    var blobs = [];

    for await (const blob of userBucket.listBlobsFlat({prefix:prefix+"/"})) {
        blobs.push(blob);
    }

    return blobs;
}
function getUploadBucket(){
    const uploadBucketName = process.env.UPLOAD_BUCKET ;
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    return blobServiceClient.getContainerClient(uploadBucketName);
}
export async function userFileLinks(prefix){
    const bucket = getUploadBucket();
    var files = await getUserBucketFiles(prefix);
    var filenames = files.map(file => 
        {
            return {
                name: file.name.replace(prefix+'/',"" ),
                link: bucket.url+"/"+file.name
            };
        });
    //console.log("filenames: ",filenames);
    return filenames;
}
export async function changeToMPKPrefix(missionary_profile_key){
    //get profile, then user_id from user 
    // get list of files
    // copy to new prefix
    // set use_mpk_prefix to true and save
    // delete old prefix files
    
    try{
        const secret = process.env.JWT_SECRET;
        const token = jwt.sign({
                //role: 'ergatas_web',
                role: 'ergatas_org_admin',
                sub:"a1da7bec-d229-4da7-8b74-0d5a2448a41a"
            },secret,{ expiresIn: 60 })




        const profile = await getDB(token).getProfileByKey(missionary_profile_key);
        //console.log("profile: ",profile);
        if(profile == null) throw AppError("Failed to get profile with key "+missionary_profile_key);

        if(profile.data.use_mpk_prefix === true){
            console.log("profile "+missionary_profile_key+" already set to use mpk prefix");
            return;
        }

        const user = await getDB().dbAuthGet("/user_info?user_key=eq."+profile.user_key,getDB().single());
        //console.log("user: ",user);
        if(user == null) throw AppError("failed to get user with key "+profile.user_key);

        const oldPrefix = user.external_user_id;
        const newPrefix = "MPK"+missionary_profile_key;
        console.log(`Old prefix: ${oldPrefix}, new prefix: ${newPrefix}`)
        const bucket = getUploadBucket();
        var files = await getUserBucketFiles(oldPrefix,bucket);
        var blobClient;
        for(const file of files){
            const name =  file.name.replace(oldPrefix+'/',"");
            const sourceURL=  bucket.url+"/"+file.name;
            console.log(`copying from ${sourceURL} to ${newPrefix}/${name}`);
            blobClient = bucket.getBlobClient(newPrefix+"/"+name);
            await blobClient.syncCopyFromURL(sourceURL);
        }
        profile.data.use_mpk_prefix = true;
        profile.data.picture_url = profile.data.picture_url.replace(oldPrefix,newPrefix);
        await getDB(token).updateProfile(missionary_profile_key,profile);

        for(const file of files){
            console.log("deleting file "+file.name);
            await bucket.deleteBlob(file.name);
        }

    }catch(error){
        console.error("failed to copy files to new prefix for profile "+missionary_profile_key,error);
        throw error;
    }

}
export async function nonProfitSearch(query,state){
    var ein,url;

    if(/[-0-9]+/.test(query)){
        // query is in format of EIN, either all numbers or xx-xxxxxx
        ein = parseInt(query.replace(/-/g,""));
        url = "https://projects.propublica.org/nonprofits/api/v2/organizations/"+ein+".json";
    }else{
        url = "https://projects.propublica.org/nonprofits/api/v2/search.json?c_code[id]=3&q="+query;

        if(state){
            url = url + "&state%5Bid%5D="+state;
        }
    }

    return axios.get(url).
        then(function(response){
            //if ein query type
            if(response.data.organization != null){
                if(ein != null)
                    response.data.organization.displayEIN = query; // so it matches what the user typed in
                return {
                    organizations: [ response.data.organization ]
                };
            }else
                return response.data;
        }).catch( (error) =>{
            console.warn(" nonprofit query failed for "+query);
            //return empty result
            return {
                organizations: []
            };
        });

};
export async function notifyOrgApplication(user_key,external_user_id, organization_key){
    const orgNotifyEmail = process.env.ORG_APP_NOTIFY_EMAIL;
    const baseUrl = process.env.REDIRECT_URL;
    var user,email,data,body;
    const mailDomain= process.env.MAIL_DOMAIN;

    try{
        email = await userIdToEmail(external_user_id);
        console.log("email: "+email);
    }catch(error){
        console.warn("failed to fetch email for user id "+external_user_id,error);
        email="email not found";
    }
    try{
        data = {
            from: "information@"+mailDomain,
            to: orgNotifyEmail,
            subject: "New Organization Application. org key: "+organization_key,
            text: "User "+user_key+", "+email+", has submitted a  new organization for approval.\n "+
                    baseUrl+"organization-review/"+organization_key,
        };
        body = await sendEmail(data);
        console.log("org application notification email sent!");
    }catch(error){
        console.error("org application notification email failed: ",error);
        throw new AppError("failed to send org application notification message");
    }

};
export async function updateJPWorkerCache(joshuaProject){

    var peopleGroups = (await getDB().peopleGroupsWithWorkers()).map(x=>x.code);
    var countries = (await getDB().countriesWithWorkers()).
                              map(x=>x.code.toLowerCase());
    console.log("fetched JP worker data: ",peopleGroups,countries);
    joshuaProject.updateWorkerCache(peopleGroups,countries);

};
export async function notifyOrgUpdate(token,organization_key,message){
    //fetch list of external_user_ids from organization_listeners_to_notify
    // send either approved or denied email
    
    const org = (await getDB(token).getOrganization(organization_key));
    const mailDomain= process.env.MAIL_DOMAIN;
    //console.log("notifyOrgUpdate: org ",org);
    var emailHtml;
    var emailText;
    //console.log("org status: "+org.status);
    if(org.status === "approved"){
        emailHtml= fs.readFileSync(process.cwd()+"/lib/snippet-templates/org-approved.html","utf8");
        emailText = "Your organization application has been approved! "+
                " To create your profile go to ergatas.org/profile .";
    }else if(org.status === "denied"){
        emailHtml= fs.readFileSync(process.cwd()+"/lib/snippet-templates/org-denied.html","utf8");

        const $ = cheerio.load(emailHtml);

        emailText =  message || "Unfortunately, we don't feel that this organization sufficiently agrees with our statement of faith, and "+
                  "is therefore not eligible to be included on Ergatas. If you feel this is an error, feel free to reply to "+
                  "this email explaining why. You can also review our statement of faith at ergatas.org/sof .";
        $("#message_block").append(emailText);
        emailHtml = $.html();

    }else{
        throw new AppError("organization "+organization_key+" has not been marked as approved or denied yet");
    }

    const emailData = {
        from: "information@"+mailDomain,
        subject: "Ergatas Application for "+org.name,
        html: emailHtml,
        text: emailText
    };
    const users = (await getDB(token).selectOrganizationListeners(organization_key));
    for(var i in users){
        var user = users[i];
        console.info("sending org status update email to "+user.external_user_id);
        var email = await userIdToEmail(user.external_user_id);
        emailData.to = email;
        await sendEmail(emailData);
       // console.log("done sending to "+user.external_user_id);
    }
    //delete listeners
    await getDB(token).deleteOrganizationListeners(organization_key);

}

export function recordLokiLog(indexName,logs){
    const lokiURL = process.env.LOKI_URL

    if(lokiURL == null)
        return;
        
    var data = {
        streams:logs.map(log => {
                return {
                    stream:{
                        app:indexName,
                        severity:log.level,
                    },
                    values: [[String(log.timestamp*1000000),JSON.stringify(log)]],
                };
            })
    };
    //console.local("loki log: ",JSON.stringify(data));
    return axios.post(lokiURL+"/loki/api/v1/push",data,
        {
            headers: {
                "Content-Type":"application/json",
            }
        }).then((response)=>{
            if(response.error != null && response.error.reason != null){
                throw new AppError("Failed to record batch of log messages: "+response.error.reason);
            }
        }).catch((error) =>{
            console.error("Failed to record batch of log messages to "+lokiURL+", ",error.message);
            throw error;
        });

}
export async function validateRecaptcha(token,action,remoteIp){

    const verifyUrl = process.env.GOOGLE_RECAPTCHA_VERIFY_URL;
    const secret = process.env.GOOGLE_RECAPTCHA_SECRET_KEY;
    return axios.post(verifyUrl,
        "secret="+secret+"&"+
        "response="+token+"&"+
        "remoteip="+remoteIp
    ).then((response)=>{
        //console.log("recaptcha response: ",response.data);
        if(response.data == null)
            throw new AppError("request to verify recaptcha token failed. no data returned");
        if(response.data.success === false)
            throw new AppError("request to verify recaptcha token failed. success was false");
        if(response.data.action != null && response.data.action !== action)
            throw new AppError("request to verify recaptcha token failed. returned action did not match given action: "+
                                response.data.action+" != "+action);
        return response.data.score;
    });
    
}

async function getFusionUser(userId){
    const response=await fusionRequest("GET","/api/user/"+userId);
    return response.data.user;
}
async function getFusionUserByEmail(email){
    const tenantId = process.env.AUTH_TENANT_ID;
    try{

        return (await fusionRequest("GET","/api/user?email="+email,null,
                                        {"X-FusionAuth-TenantId":tenantId})).data.user;
    }catch(error){
        return null;
    }
}
async function updateFusionUser(userId,email,user){
    try{
        user.email=email; //required field
        const response = await fusionRequest("PATCH","/api/user/"+userId,{user:user});
    }catch(error){
        console.error("failed to update fusion user: ",error);
    }
}
export async function userIdToEmail(userId){
    console.local("fetching email for user id "+userId);
    try{
        const user = await getFusionUser(userId);
        return user.email;
            //then((response)=>{
                ////console.local("user information response: ",response.data,response.data.user);
                //return response.data.user.email;
            //});
        //return x;
    }catch(error){
        //console.local("LOCAL failed to fetch email for userId "+userId,error);
        console.error("failed to fetch email for userId "+userId,error && error.response && error.response.data);
        throw error;
    }
}
export async function getUserEmails(userIds){
    //console.local("fetching emails for users: ",userIds);
    return Promise.all(userIds.map(async (userId) =>{
        var email="";
        try{
            email = await userIdToEmail(userId);
        }catch(error){
            console.warn("failed to translate email for exernal_user_id "+userId,error.message);
        }
        return {
            external_user_id: userId,
            email:email,
        }
    }));
        
}
export async function isUserVerified(userId){
    const user = await getFusionUser(userId);
    return {verified:  user.verified};
   // return fusionRequest("GET","/api/user/"+userId).
   //     then((response)=>{
   //         return {verified:  response.data.user.verified};
   //     });
}
export function resendVerifyEmail(email){
    const tenantId = process.env.AUTH_TENANT_ID;
    return fusionRequest("PUT","/api/user/verify-email?email="+email,null,{
        "X-FusionAuth-TenantId":tenantId
    });
}

function emailToHash(emailAddress){
    const mailDomain= process.env.MAIL_DOMAIN;
    return "user_"+crypto.createHash("md5").update(emailAddress).digest("hex")+"@"+mailDomain;
}
async function saveEmailMapping(emailAddress,hash){
    console.info("saving map from "+emailAddress+" to "+hash);

   await getDB().insertEmailHashMapping(emailAddress,hash);

}
async function hashToEmail(hashedEmail){
    console.info("fetching real email for hash "+hashedEmail);
    try{

        var hashes = await getDB().getEmailHash(hashedEmail)
        if(hashes != null && hashes.email_address != null){
            console.info("found real email: "+hashes.email_address);
            return hashes.email_address;
        }
    }catch(error){
        console.error("true email not found for hashed email "+hashedEmail,error);
        throw new AppError("true email not found for hashed email "+hashedEmail+"\n"+JSON.stringify(error));
    }
    
}
export async function contact(fromEmail, fromName, message,toEmail){


    const fromHash=emailToHash(fromEmail);
    const toHash=emailToHash(toEmail);

    await saveEmailMapping(fromEmail,fromHash);
    await saveEmailMapping(toEmail,toHash);

    const data = {
        from: "Ergatas - "+fromName+" <"+fromHash+">",
        to: toEmail,
        bcc: messagingAdminEmail,
        subject: fromName+" sent you a message on Ergatas",
        text: message,
        html: message.replace(/\n/g,"<p>")
    };
    console.info("first contact mailgun data: ",data);
    try{
        var body = await sendEmail(data);
        console.info("message email sent!");
    }catch(error){
        console.error("failed to send message from user to missionary. "+error.message,error);
        throw new AppError("failed to send message");
    }
}

export async function forwardMessage(email){
    console.info("forwarding message from "+email.sender+" to "+email.recipient);
    if(email.sender == null || email.recipient == null){
       console.error("in forwardMessage: missing sender or recipient in email: ",email);
       console.error("email data: "+JSON.stringify(email));
       return;
    }
    // lookup hashed 'to' address in database to get true email address
    // also rewrite 'from' to be hashed
    const realToEmail = await hashToEmail(email.recipient);
    const hashedFrom = emailToHash(email.sender);
    //make sure we save this mapping so when they reply we know who they are
    await saveEmailMapping(email.sender,hashedFrom);

    const fromName = email.From.replace(/(.*?) <.*>$/,"$1") || "";
    console.info("From : "+email.From+", extracted name: "+fromName);
    if(email['attachment-count'] != null){
        console.info("attachments found: "+email['attachment-count'])
    }
    const data = {
        //from: hashedFrom,
        from: "Ergatas - "+fromName+" <"+hashedFrom+">",
        to: realToEmail,
        bcc: messagingAdminEmail,
        subject: email.subject,
        text: email['body-plain'],
        html: email['body-html'],
    };
    console.info("forward mailgun data: ",data);

    try{
        var body = await sendEmail(data);
        console.info("message email sent!");
    }catch(error){
        console.error("failed to send message from user to missionary. "+error.message,error);
        throw new AppError("failed to send message");
    }

}
// removes files in azure, mailing list entry, and authdb entry
export async function deleteUser(userId,email,token,missionary_profile_key){
    console.info("DELETING user "+userId,missionary_profile_key);

    //delete from database
    try{
        //see what profiles are still owned by user
        const perms = await getDB().getUserOrgSearchFilter(userId);

        //perms will be null if user is not a profile manager permission on something
        if(perms != null && perms.owned_profile_keys != null && perms.owned_profile_keys.length > 0){
            return {error:true,
                    message: "We cannot remove your account while you still own some profiles."+
                        " Please either delete each profile first, or invite the worker to take over their profile.",
                    owned_profile_keys: perms.owned_profile_keys};
        }else if(missionary_profile_key != null){ //normal user, delete their profile first
            await getDB(token).deleteProfile(missionary_profile_key);
        }

        await getDB(token).deleteUser(userId);


        await removeAllFiles(userId);

        fusionRequest("DELETE","/api/user/"+userId+"?hardDelete=true");
    }catch(error){
        console.error("failed to delete user "+userId+" from DB: ",error);
        return {
            error:true,
            message: "Sorry, an error occurred while removing your account. Please contact us.",
        }
    }


    //delete from MailChimp
    try{
        console.log("removing user "+userId+" from mailchimp");

        mailingList.removeUser(email);
    }catch(error){
        console.warn("failed to remove user from mailing list: "+error.message,error);
    }

    return {};
}
async function deleteUserFromDB(user_key){

    try{
        await getDB().deleteUser(user_key);
    }catch(error){
        console.error("failed to delete user_key "+user_key+" from db: ",error);
    }
}
export async function checkProfileUpdates(){
    const disableDays = 2*365; // 2 years
    const warning1Days = disableDays - 60;
    const warning2Days = disableDays - 30;
    const days = 24*60*60*1000

    const now= new Date();
    const warning1Date = new Date(now - warning1Days*days);
    const warning2Date = new Date(now - warning2Days*days); 
    const disableDate = new Date(now - disableDays*days);
    const stats = {
        disabled: {success: 0, failed:0},
        warning1Sent: {success: 0, failed:0},
        warning2Sent: {success: 0, failed:0},
    };
    console.info("now: "+now.toISOString());
    console.info("warning 1 date: "+warning1Date.toISOString());
    console.info("warning 2 date: "+warning2Date.toISOString());
    console.info("disable date: "+disableDate.toISOString());


    var processProfile = ( newState,emailNoticeFn,stat)=>{
        console.log("creating function for state "+newState);
        return async (profile) =>{
            try{
                console.info("======= processing profile for targetState "+newState,profile);
                await Promise.all([
                    emailNoticeFn(profile.external_user_id),
                    getDB().updateProfileState(profile.missionary_profile_key,newState),
                ]);
                stat.success = stat.success + 1;
            }catch(error){
                console.error("failed to move profile to state "+newState+", userId: "+profile.external_user_id+
                                ". "+error.message);
                stat.failed = stat.failed + 1;
            }
        };
    }


    //disable accounts
    var profilesToDisable = (await getDB().profilesByLastUpdate(disableDate.toISOString()))

    //console.log("profiles to disable: ",profilesToDisable);
    if(profilesToDisable != null)
        await Promise.all(profilesToDisable.
                    map(processProfile("disabled",emailDisableNotice,stats.disabled)));


    //warning 2 accounts
    var warning2Profiles= (await getDB().profilesByLastUpdate(warning2Date.toISOString()))
    //console.log("profiles in warning2: ",warning2Profiles);
    if(warning2Profiles != null)
        await Promise.all(warning2Profiles.
                    filter(profile => profile.state === "warning1").
                    map(processProfile("warning2",emailWarning2Notice,stats.warning2Sent)));


    //warning 1 accounts
    var warning1Profiles= (await getDB().profilesByLastUpdate(warning1Date.toISOString()))
    //console.log("profiles in warning1: ",warning1Profiles);
    if(warning1Profiles != null)
        await Promise.all(warning1Profiles.
                    filter(profile => profile.state === "current").
                    map(processProfile("warning1",emailWarning1Notice,stats.warning1Sent)));

    console.info("stats: ",stats);
    return stats;

}
function emailWarning1Notice(userId){
    return emailUpdateNotice(userId,"update-reminder-1.html",
        "It looks like it's been over a year since your last profile update! "+
        " For best results, it's important to keep your profile up to day, particularly your current support level. "+
        " Go to ergatas.org/profile to make your updates. If nothing has changed, just click the 'Save' button to indicate that."+
        " If no updates are made for 2 years, your profile will no longer be shown in search results. "
    );
}
function emailWarning2Notice(userId){
    return emailUpdateNotice(userId,"update-reminder-2.html",
        "It looks like it's been over a year since your last profile update! "+
        " For best results, it's important to keep your profile up to day, particularly your current support level. "+
        " Go to ergatas.org/profile to make your updates. If nothing has changed, just click the 'Save' button to indicate that."+
        " If no updates are made for 2 years, your profile will no longer be shown in search results. "
    );
}
function emailDisableNotice(userId){
    return emailUpdateNotice(userId,"profile-disabled.html",
        "Oh no! It looks like it's been over 2 years since your last profile update! "+
        " Your profile has now been disabled and will not be shown in search results. "+
        " To re-activate your profile, go to ergatas.org/profile, make any updates, then click 'Save'"
    );
}
async function emailUpdateNotice(userId,templateName,textVersion){
    var email ;
    var emailTemplate;
    const mailDomain= process.env.MAIL_DOMAIN;
    
    try{
        email = await userIdToEmail(userId);
        console.log("got user email: "+email);
    }catch(error){
        console.error("failed to get email for user id "+userId+". "+error.message);
        return;
    }
    try{
        //console.log("snippet path: "+process.cwd()+"/lib/snippet-templates/"+templateName);
        emailTemplate  = fs.readFileSync(process.cwd()+"/lib/snippet-templates/"+templateName,"utf8");
    }catch(error){
        console.error("failed to get email template "+templateName+" while sending notice to user id "+userId+
            ", "+error.message);
        return;
    }


    const data = {
        from: "information@"+mailDomain,
        to: email,
        bcc: "update-reminders@"+mailDomain,
        subject: "Action Needed - Ergatas Profile Update Reminder",
        text: textVersion,
        html: emailTemplate,
    };
    //console.log("update notice mailgun data: ",data);

    try{

        if(process.env.NODE_ENV === "development")
            console.local("development mode, otherwise would have sent email to : ",data.to);
        else
            await sendEmail(data);
        console.info("update notice message email sent to "+userId);
    }catch(error){
        console.error("failed to send update notice email to userId"+userId+", with email "+email+
            ". "+error.message,error);
        throw new AppError("failed to send update notice message");
    }

}

export async function addUserToMailinglist(email){
    console.log("adding new user to mailing list ",email);

    try{
        await mailingList.ensureUser(email);
        await mailingList.addTags(email,["User"]);
    }catch(error){
        console.warn("failed to add or set tag for new User "+email+": "+error.message,error);
    }
}
export async function newsletterSignup(firstName,lastName,email,addToPrayerList,recaptchaScore,dailyPrayer,mobilizer){
    console.info("doing newsletter signup. score: "+recaptchaScore+". ",firstName, lastName, email,addToPrayerList,mobilizer);

    const tags = ["Newsletter"];

    if(addToPrayerList){
        tags.push("Prayer List");
    }
    if(dailyPrayer){
       tags.push("Missionary of the Day");
    }
    if(mobilizer){
        tags.push("Mobilizer");
    }
    try{
        await mailingList.ensureUser(email);
        await mailingList.addTags(email,tags);
        await mailingList.setUserName(email,firstName,lastName);
    }catch(error){
        console.error("failed to add user to newsletter "+email+": "+error.message,error);
        throw error;
    }
}
export async function newProfile(email,firstName,lastName){
    console.local("setting user name: "+firstName+", "+lastName+", email: "+email);

    try{
        await mailingList.ensureUser(email);
        await mailingList.addTags(email,["Missionary"]);
        await mailingList.setUserName(email,firstName,lastName);

    }catch(error){
        console.warn("failed to set user name: "+firstName+", "+lastName+", email: "+email);
    }
}
export async function deleteProfile(missionary_profile_key,token,unlinkOnly){
    console.info("DELETING Profile "+missionary_profile_key);

    const payload = jwtPayload(token);
    const userId = payload.sub;

    if(unlinkOnly === false)
        await getDB(token).deleteProfile(missionary_profile_key);

    //update search_filter
    const userPerms = await getDB().getUserOrgSearchFilter(userId);
    const search_filter = userPerms && userPerms.search_filter;
    let doUpdate = false;

    for(var list of ["missionary_profile_keys","ro_profile_keys"]){
        if(search_filter != null && search_filter[list] != null){
            //remove missionary_profile_key from it
            search_filter[list]= 
                search_filter[list].filter(key => key != missionary_profile_key);
            doUpdate = true
        }
    }
    if(doUpdate){
        console.log("saving new search filter for org "+userPerms.organization_key,search_filter);
        await getDB().updateOrganization(
            userPerms.organization_key,{ search_filter: userPerms.search_filter, });
    }

}
export async function inviteProfileOwner(ownerName,ownerEmail,adminEmail,profile_key,adminUserId,token){
    try{
        //send new profile message
        const user = await getFusionUser(adminUserId);
        //console.log("got user: ",user);
        const adminName = user.fullName || 'Admin';

        const userPerms = (await getDB().getUserOrgSearchFilter(adminUserId));
        //console.log("got perms: ",userPerms);
        const profile = await getDB(token).getProfileByKey(profile_key)
        const org = await getDB().getOrganization(profile.data.organization_key);
        const orgName = org.display_name;

        //see if owner already has an ergatas account with given email
        const owner = await getFusionUserByEmail(ownerEmail);
        //console.log("owner: ",owner);
        if(owner != null){

            const user = (await getDB().getUserInfoByUserId(owner.id));
            console.log("owner user: ",user);
            if(user.has_profile === true){
                console.log("user "+user.user_key+" already has profile(s) "+user.missionary_profile_keys);
                return {existingProfile: true,
                        missionary_profile_keys: user.missionary_profile_keys};
            }
            //try{
                //const userProfile = await getDB().getProfileByUser(user.user_key);
            //}catch(e){
                //// no existing profile, so we're ok.
            //}

            //then auto accept
            await setProfileOwner(token,owner.id,profile_key);
            await sendEmail({
                from: "web@"+process.env.MAIL_DOMAIN,
                to: ownerEmail,
                bcc: messagingAdminEmail,
                subject: "New  profile created for you on Ergatas.org",
                text:`
${ownerName},

${adminName} has created a Kingdom Worker profile representing you and your ministry with "${orgName}" on Ergatas.org. 

You can edit this profile by logging into your Ergatas account.

If you don’t want such a profile created on your behalf, we encourage you to contact ${adminName} at ${adminEmail} and let them know. If that fails, you can contact us at info@ergatas.org.

Thank you!

Ergatas Team `
            });
            return {existingProfile: false,autoAssigned:true};
        }


        await getDB().insertProfileInvitation(adminUserId,profile_key,ownerEmail);

        await sendEmail({
            from: "web@"+process.env.MAIL_DOMAIN,
            to: ownerEmail,
            bcc: messagingAdminEmail,
            subject: "New  profile created for you on Ergatas.org",
            text:`
${ownerName},

${adminName} has created a Kingdom Worker profile representing you and your ministry with "${orgName}" on Ergatas.org. Ergatas is a free web app that tries to help workers raise their personal support by making their ministry visible to more people.

If you’d like to be able to manage this profile yourself in the future, please create a free account on https://ergatas.org using the email address ${ownerEmail}. Then visit your dashboard to automatically claim your profile:

https://ergatas.org/dashboard

If you don’t want such a profile created on your behalf, we encourage you to contact ${adminName} at ${adminEmail} and let them know. If that fails, you can contact us at info@ergatas.org.

Thank you!

Ergatas Team `
        })
        return {existingProfile: false};
    }catch(error){
        console.error("failed to send email to profile owner: ",error);
        if(error.name==="TokenExpiredError")
            throw error;
        throw new AppError("failed to invite profile owner for profile key "+profile_key);
    }
}
export async function claimProfile(token){
    const payload = jwtPayload(token);
    const invitation = (await getDB(token).getProfileInvitations());
    if(invitation != null && invitation.email === payload.email){
        console.log("claiming invite ",invitation);
        await setProfileOwner(token,payload.sub,invitation.missionary_profile_key);
        await  getDB().deleteProfileInvitation(invitation.profile_invitation_key)
    }
}
export async function setProfileOwner(token,userId,profile_key){
    console.log("setting owner of profile "+profile_key+" to "+userId);
    const profile = (await getDB(token).getProfileByKey(profile_key));
    console.log("got existing profile: ",profile);
    const user = (await getDB().getUserInfoByUserId(userId));
    console.log("got user to set owner to: ",user);
    profile.user_key = user.user_key;

    await getDB(token).updateProfile(profile.missionary_profile_key,profile);

}
export async function assignNewProfilePermissions(userId,missionary_profile_key){

    const filter = (await getDB().getUserOrgSearchFilter(userId));
    //console.log("new profile. current filter: ",filter);
    if(filter.search_filter == null)
        filter.search_filter = {};

    if(filter.search_filter.missionary_profile_keys == null)
        filter.search_filter.missionary_profile_keys=[];

    if( ! filter.search_filter.missionary_profile_keys.includes(missionary_profile_key))
        filter.search_filter.missionary_profile_keys.push(missionary_profile_key);

    //console.log("filter with new profile: ",filter);
    await getDB().updateOrganization(filter.organization_key,{search_filter:filter.search_filter});

    //update permissions cache
    await getManagedProfiles(userId)
    
}
export async function getMissionaryProfile(missionary_profile_key){
    return (await getDB().getDisplayProfileByKey(missionary_profile_key));
}
export function sendMessage(name,email,message){
    const mailDomain= process.env.MAIL_DOMAIN;
    return sendEmail({
            from: "web@"+mailDomain,
            "h:Reply-To":email,
            to: "information@"+mailDomain,
            subject: "Contact Form Message",
            text: "Message from: "+name+", "+email+"\n\n"+message,
        });
}
export const sendBulkMessage= function(emails,subject,message){
    const mailDomain= process.env.MAIL_DOMAIN;
    const allEmailAddresses = emails.join(", ") + ", information@ergatas.org";
    return sendEmail({
            from: "Ergatas <web@"+mailDomain+">",
            to: "Ergatas <web@"+mailDomain+">",
            bcc: allEmailAddresses,
            subject: subject,
            html: message
        });
}
export async function orgSlugCache(){
    const orgs = (await getDB().organizationList());
    const cache = {};
    for(const org of orgs){
        if(org.slug != null && org.slug !== "")
            cache[org.slug] = org;
    }
    return cache;
}
function addImageHeaders($,image_url){
    const bucketName = process.env.UPLOAD_BUCKET;
    const bucketBaseUrl= process.env.BUCKET_BASE_URL;
    const bucketBase=bucketBaseUrl+"/"+bucketName+"/";
    $("meta[property='twitter:image']").attr("content",bucketBase+image_url);
    $("meta[property='og:image']").attr("content",bucketBase+image_url);
    $("meta[property='og:image:width']").attr("content","400");
    $("meta[property='og:image:height']").attr("content","400");
}
export async function buildIndex(pageName,info,url,org){

    //console.local("building index for page "+pageName,info,url);
    const __dirname = path.resolve();
    const index= fs.readFileSync(`${__dirname}/lib/page-templates/index.html`,'utf-8');
    const subdir = info.path || "";

    var missionary_profile_key,profile;
    var canonicalUrl;
    const domain = process.env.DOMAIN;

    const $ = cheerio.load(index);


    if(info && info.prerender !== false){
        const page_template = fs.readFileSync( `${__dirname}/lib/page-templates/${subdir}${pageName}.html` ,'utf-8');
        $("#page_content").append(page_template);

    }


    if(pageName === "home" || pageName ==="index" || pageName==="coming-soon")
        pageName=""; //set to root page

    try{
        if(info.path != null){
            //canonicalUrl=`https://ergatas.org/${info.path}${pageName}`;
            canonicalUrl=`https://${domain}/${info.path}${pageName}`;
        }else if(["search","organization"].includes(pageName) 
                   && ! url.match(/^\/search\/saved\//)){
            canonicalUrl=`https://${domain}${url}`;
        }else
            canonicalUrl=`https://${domain}/${pageName}`;
    }catch(error){
        console.error("error while setting canonical URL ",error);
        canonicalUrl=`https://${domain}/${pageName}`;
    }

    //console.local("canonicalURL: "+canonicalUrl);

    if(pageName==="profile-detail" && url != null){
        try{
            //set title to worker name and picture to profile picture
            var matches = url.match(/\/(\d+)(?:\?.*)?$/);
            if(matches.length >= 2){
                missionary_profile_key = matches[1];
                canonicalUrl = canonicalUrl+"/"+missionary_profile_key;
                profile = (await getDB().getDisplayProfileByKey(missionary_profile_key));
                //console.local("profile: ",profile);

                $("title").html("Ergatas Profile - "+profile.missionary_name);
                if(profile.data.picture_url){
                    addImageHeaders($,profile.data.picture_url);
                }

                if(profile.limit_social_media === false){
                    console.local("not indexing profile "+missionary_profile_key+", limit_social_media: "+profile.limit_social_media);
                    $("head").append("<meta name='robots' content='noindex'/>");    
                }
            }else
                console.warn("failed to parse missionary_profile_key out of url "+url);
        }catch(error){
            console.error(`failed to add worker specific info to meta tags on profile-detail (/${missionary_profile_key}) page: ${error.message}`);
            if(info && info.title)
                $("title").html(info.title);
        }
    }else if(pageName === "organization" && org != null){
        try{
            $("title").html("Ergatas Organization - "+org.display_name);
            if(org.logo_url)
                addImageHeaders($,org.logo_url);

            //remove nav
            $("nav").remove();
            //remove 'install as app?' banner
            $("#install_banner").remove();
            //replace footer
            $("footer").html(`
                <div class="container"><div class="row"><div class="col text-center">
                    <a href="https://${domain}" target="_blank">
                        <img class="mt-4" alt="Ergatas logo" id="logo-bottom" height="50" src="/img/ergatas_trans_logo.svg"></a>
                </div></div></div>
            `)
             //indicate that this is a landing page
             $("body").append(`<div id="is_search_page"></div>`);
            
        }catch(error){
            console.error(`failed to add organization specific info to meta tags on organization (/${url}) error: ${error.message}`);
            if(info && info.title)
                $("title").html(info.title);
        }
    }else{
        if(info && info.title)
            $("title").html(info.title);
        if(info && info.sharing_image){
            addImageHeaders($,`https://${domain}${info.sharing_image}`);
            $("meta[property='og:image:width']").remove();
            $("meta[property='og:image:height']").remove();
        }
    }

    $("head").append(`<link rel="canonical" href='${canonicalUrl}' />`);

    if(org && org.description != null && org.description !=="")
        $("meta[name=description]").attr("content",org.description);
    else if(info && info.description)
        $("meta[name=description]").attr("content",info.description);

    if(info && info.indexed===false){
        $("head").append("<meta name='robots' content='noindex'/>");    
    }
    return $.html();

}
export function setCustomCacheControl(res, path) {
    if (serveStatic.mime.lookup(path).startsWith('image/')) {
        //cache images for 1 day
        res.setHeader('Cache-Control', 'public, max-age='+(24*60*60*1000));
    }
}
export function validOrigin(req){

    const validOrigins = process.env.CLIENT_ORIGINS.split(";");
    const origin = req.headers.origin;
    return validOrigins.indexOf(origin) !== -1;
}
export function sitemapUrlsFn(pageInfo){

    return async function(){
        var urls = ["/"];
        const pages = Object.keys(pageInfo).filter( page => page !== "profile-detail");
        pages.forEach( page => {
            const info = pageInfo[page];
            if(info.indexed !== false){
                if(info.path != null){
                    urls.push(`/${info.path}${page}`);
                }else
                    urls.push(`/${page}`);
            }
        })

        try{
            const profileKeys = (await getDB().getAllProfileKeys());
            profileKeys.forEach( profile => {
                urls.push(`/profile-detail/${profile.missionary_profile_key}`);
            });
        }catch(error){
            console.error("failed to get profile-detail urls from DB",error);
        }

        return urls;

    };

}
export async function randomMissionary(){
    const profile = (await getDB().randomSharableProfile());
    //console.local("got random profile ",profile);
    return profile;
}

export async function getPushSubscription(push_subscription_key){
    try{
       return (await getDB().getPushSubscription(push_subscription_key)).subscription;
    }catch(error){
       console.error("failed to get subscription for key "+push_subscription_key,error);
    }
}
export async function unsubscribePushNotifications(subscription){
   await getDB().deletePushSubscription(subscription);
}

export async function savePushSubscription(subscription,lists){
    try{
       await getDB().insertPushSubscription(subscription,lists);
    }catch(error){
       console.error("failed to insert new subscription ",error);
    }
}
export async function sendMODNotification(push_subscription_key,feeds){
   var sub = await getPushSubscription(push_subscription_key);
   console.local("sub for key "+push_subscription_key,sub);
   sendMODNotifications(feeds,[sub]);
}
export async function sendMODNotifications(feeds,subscriptions){
   const profile = feeds.headItem("missionaryOfTheDay");
   //console.local("MOD profile: ",profile);

   if(profile == null)
      return;

   const payload = {
      title: "Ergatas Notice",
      body: "Pray for "+profile.author,
      url: profile.url,
   };

   if(profile.enclosure && profile.enclosure.url){
      payload.image = profile.enclosure.url;
   }
   if(subscriptions == null) { //use all subscriptions
      subscriptions = (await getDB().getPushSubscriptions(["daily_prayer_list"]))
                           .map(row => row.subscription);
   }
   //console.local("subscriptions: ",subscriptions);
   console.info("sending notification to "+subscriptions.length+" subscriptions");
   subscriptions.forEach( sub => sendNotification(sub,payload,"daily_prayer_list"));

}
export async function sendNotification(subscription,payload,topic){

	const options={ };

   if(topic != null && topic !== ""){
      options.headers = {
         topic: topic
      };
   }

   webPush.setVapidDetails(
        'https://ergatas.org/',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
   );

	console.local("sending push notification",subscription, payload, options);
   try{
      await webPush.sendNotification(subscription, JSON.stringify(payload),options)
   }catch(error){
      console.error("notification failed: ",error);
   }

}

export async function sendMODEmails(feeds){
   var content;
   const profile = feeds.headItem("missionaryOfTheDay");
   if(profile == null || profile.url == null){
      console.error("no missionary of the day found");

      return;
   }
   //console.local("profile: ",profile);
   const emailHtml= fs.readFileSync(process.cwd()+"/lib/snippet-templates/mod-email.html","utf8");
   const settings={
                subject_line: "Ergatas Missionary of the Week",
                preview_text: `Pray for the ministry of ${profile.author}`,
                from_name: "Ergatas",
                reply_to: "information@ergatas.org",
                title: "MoD "+(new Date()).toLocaleString('en-US',{
                                                 year:"numeric",
                                                 month:"long",
                                                 day:"numeric"}),
             };

   const $ = cheerio.load(emailHtml);

   $("#name").html(profile.author);
   $(".profile_link").attr("href",profile.url);
   $(".contact_link").attr("href",profile.url+"#connect");
  


   if(profile.enclosure && profile.enclosure.url){
      $("#image").attr("src",profile.enclosure.url);
      $("#image").attr("alt",profile.author);
   }else{
      $("#image_row").html("");
   }

   try{
       if(profile.guid != null){
           const fullProfile =await getMissionaryProfile(profile.guid);
           console.local("full profile: ",fullProfile);
           $(".description").html(fullProfile.data.description);

       }
   }catch(error){
       console.warn("failed to fetch full profile for MOD email: ",error);
   }


   content = $.html();
   mailingList.sendCampaign("Missionary of the Day",content,settings);
}
/* not used anymore
export async function emailUsersWithDonationClicks(monthsPrev=1,test=false){

   console.local("emailing users with donation clicks");
   var start = new Date();
   var end = new Date();
   var indexedUsers = {};
   const dayInMillies = 24*60*60*1000;
   //set to first of last month
   start.setDate(1); 
   start.setMonth(start.getMonth() - monthsPrev);

   end.setMonth(start.getMonth() + 1);
   end.setDate(1);
   end.setTime(end.getTime() - dayInMillies); //rollback one day to get last day of previous month

   console.local(`date range:[${start},${end}]`);

   try{
      const users = (await getDB().getUsersWithDonation(start,end));
      console.local("found "+users.length+" users in range");
      users.forEach(user => {indexedUsers[user.external_user_id] = user });
      (await getUserEmails(users.map( user => user.external_user_id)))
         .forEach( info =>
            indexedUsers[info.external_user_id].email= info.email);

      Promise.all(
         users.filter(user => user.email != null && user.email !== "").
            map(async user =>{
               console.local(user.first_name,user.email,user.last_possible_tx_date,user.tx_dates);
               var dates = new Set(user.tx_dates.split(",").
                              map( d => new Date(d)).
                              filter(d => d.getMonth() === start.getMonth()).
                              map(d => d.toLocaleString('en-US',{year:'numeric',month:'long',day:'numeric'})));
               console.local("dates: ",dates);
               return await sendDonationClickEmail(user.first_name,user.email,dates,test);
      }));

   }catch(error){
      console.error("error while emailing users with donation clicks: ",error);
   }

}
*/
async function sendDonationClickEmail(name,email,dates,test){

   const mailDomain= process.env.MAIL_DOMAIN;
   console.local("sending donation click email to "+email);
   const snippetName="end-of-month-donation-clicks.html";
   const __dirname = path.resolve();
   const template = fs.readFileSync(`${__dirname}/lib/snippet-templates/${snippetName}`,'utf-8');

   const $ = cheerio.load(template);
   var dateStr="";
   dates.forEach( d => dateStr = dateStr+d+"<br/>");

   console.local("name: "+name+", email: "+email+", dateStr:"+dateStr);
   $("#name").html(name);
   $("#dates").html(dateStr);

   try{
      if(test)
         email = "kevin.horan@ergatas.org";

      await sendEmail( {
            from: "information@"+mailDomain,
            to: email,
            bcc: messagingAdminEmail,
            subject: "Possible Donation on Ergatas",
            html: $.html(),
      });
   }catch(error){
      console.error("failed to send donation click email: ",error);
   }
}

export  function cleanupFiles(files){
	console.info("cleaning up files: ",files);	
	Object.values(files).forEach( file => deleteFile(file.path));
}
function deleteFile(filename){
	console.info("attempting to delete filename "+filename);
	fs.unlink(filename, function(err) {
		 if(err && err.code == 'ENOENT') {
			  // file doens't exist
			  console.info("File doesn't exist, won't remove it.");
		 } else if (err) {
			  // other errors, e.g. maybe we don't have enough permission
			  console.error("Error occurred while trying to remove file: "+err.code,err);
		 } else {
			  console.info(`removed file ${filename}`);
		 }
	});
}
export async function queueMessage(userId,fromEmail,name, message){

    try{ //send notice of new message, but don't die if it fails
       sendEmail({
           from: "Ergatas App <information@ergatas.org>",
           to: "kevin.horan@ergatas.org",
           subject: "NEW MESSAGE to review",
           html: "<a href='https://ergatas.org/message-moderation'>Messages</a><br>"+message,
       });
    }catch(error){
    }
    try{
       await getDB().insertMessage(userId,fromEmail,name,message);
    }catch(error){
       console.error(`failed to save in-app message. from ${name} <${fromEmail}> to ${userId}`,message);
    }
}
export  async function sendQueuedMessage(messageQueueKey){
   var messageInfo = (await getDB().getMessage(messageQueueKey));
   //console.local("message info for queue key "+messageQueueKey+": ",messageInfo);

   const toEmail = await userIdToEmail(messageInfo.external_user_id);
   console.log("email for user id "+messageInfo.external_user_idd+": "+toEmail);
   const result =await  contact(
                           messageInfo.from_email,
                           messageInfo.from_name,
                           messageInfo.message,toEmail);
   console.log("contact result: ",result);
}
export async function deleteQueuedMessage(messageQueueKey){
    await getDB().deleteMessage(messageQueueKey);
}
export async function getAllQueuedMessages(){
   return (await getDB().getAllMessages());
}

async function getAccessToken(){

    const refreshToken=process.env.GOOGLE_ANALYTICS_REFRESH_TOKEN;
    const clientId=process.env.GOOGLE_ANALYTICS_CLIENT_ID;
    const clientSecret=process.env.GOOGLE_ANALYTICS_CLIENT_SECRET;

    try{
        var response = await axios({
            method: "POST",
            url: "https://www.googleapis.com/oauth2/v4/token",
            data: {
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: "refresh_token",
                refresh_token:refreshToken,
            }
        });
        if(response.data){
           return response.data.access_token;
        }else
            throw new AppError("no data field in response while getting access token for GA");
    }catch(error){
        console.error("failed to get analytics refresh token");
    }

}
async function analyticsQuery(params,accessToken){
    const viewId =process.env.GOOGLE_ANALYTICS_VIEW_ID;
    try{
        params.ids="ga:"+viewId;
        params['start-date']="2020-01-01"; // start of data collection
        params['end-date']="2023-01-01";
        
        var response = await axios({
            method: "GET",
            url: "https://www.googleapis.com/analytics/v3/data/ga",
            params: params,
            headers:{
                Authorization: "Bearer "+accessToken,
            }
        });

        if(response.data){
           //console.log("got stats: ",response.data);
           return response.data;
        }else
            throw new AppError("no data field in response while getting stats from GA");
    }catch(error){
        console.error("failed to get analytics refresh token");
    }
}

export async function getGA4ProfileStats(missionary_profile_key){
    console.log("GA4 stats for profile "+missionary_profile_key);
    const propertyId = process.env.GOOGLE_ANALYTICS_GA4_PROPERTY_ID;
    const analyticsDataClient = new BetaAnalyticsDataClient();
    const stats ={
        donationClicks:0,
        pageViews:0,
        prayers:0,
    }
    const summaryMode = missionary_profile_key == null;
    try{
        var config = {
            property: `properties/${propertyId}`,
            dateRanges: [
                {
                    startDate:"2023-01-01",
                    endDate: "today",
                }
            ],
            dimensions:[
                { name: "eventName" },
                { name: "pagePathPlusQueryString"}
            ],
            metrics:[
                { name: "eventCount" }
            ],
            limit: 10000
        }

        if( ! summaryMode){
            config.dimensionFilter = {
                filter:{
                    stringFilter:{
                        matchType: "EXACT",
                        value: "/profile-detail/"+missionary_profile_key
                    },
                    fieldName:"pagePathPlusQueryString"
                }
            }
        }else{
            console.log("no profile given, computing summary stats")
            config.dimensionFilter = {
                andGroup:{
                    expressions:[
                        {
                            filter:{
                                stringFilter:{
                                    matchType: "BEGINS_WITH",
                                    value: "/profile-detail/"
                                },
                                fieldName:"pagePathPlusQueryString"
                            }
                        },
                        
                    ]
                }
            };
        }

        const [response] = await analyticsDataClient.runReport(config);

        //console.log("response: ",JSON.stringify(response,null,2));

        const eventValue = function(name){
            //console.log("looking for event "+name);

            var sum=0;
            response.rows.forEach(row =>{
                if(row.dimensionValues[0].value === name)
                    sum = sum + parseInt(row.metricValues[0].value);
            });
            return sum;
        }

        stats.donationClicks = eventValue("donate-level-1") + eventValue("begin-checkout");
        stats.pageViews = eventValue("page_view");
        stats.prayers = eventValue("prayed");

    }catch(error){
        console.error("failed to get page stats for profile key "+missionary_profile_key);
    }
    return stats;


}
export async function getProfileStats(missionary_profile_key){
    var ga4Stats = await getGA4ProfileStats(missionary_profile_key);
    var oldStats = await getUniversalProfileStats(missionary_profile_key);
    console.log("new, old stats: ",ga4Stats,oldStats);
    return {
        donationClicks: ga4Stats.donationClicks + oldStats.donationClicks,
        pageViews: ga4Stats.pageViews + oldStats.pageViews,
        prayers: ga4Stats.prayers + oldStats.prayers,
    }

}
export async function getUniversalProfileStats(missionary_profile_key){
    // THESE ARE THE OLD STATS
    /*
    sample query: 
    https://www.googleapis.com/analytics/v3/data/ga?
        ids=ga%3A230421808&
        access_token=ya29.A0ARrdaM-vyzG-QBK2YgdXp_DPtbhaI1Mbeyq1m8u2ZktHnxH1mk-IPAT7IdMoPD6HPWeInFyPB-wICy_QmDtc5ILfJVkWnj1GsLvuqbwCX2uDnAy0EwgBI2C6UESGVZzsP87mqSEYUG48V1L9lBKHBe4SSvQs&
        dimensions=ga%3ApagePath&
        metrics=ga%3Agoal2Starts%2Cga%3Agoal2Completions%2Cga%3Apageviews&
        filters=ga%3ApagePath%3D%40profile-detail;ga:pagePath!@code&
        start-date=2020-01-01&
        end-date=today

    donation stats
        metrics=ga%3AuniqueEvents&
        filters=ga%3AeventCategory%3D%3Ddonations+level+1%3Bga%3AeventLabel%3D%3D254&

    profile page views:
        metrics=ga%3Apageviews&
        filters=ga%3ApagePath%3D%40%2Fprofile-detail%2F254%3Bga%3ApagePath%21%40code

    */

    const accessToken = await getAccessToken();
    const stats ={
        donationClicks:0,
        pageViews:0,
        prayers:0,
    }
    try{

        //var x =   "ga:eventCategory==donations level 1"+(missionary_profile_key == null ? "":(";ga:eventLabel=="+missionary_profile_key));
        //console.log(" missionary key: "+missionary_profile_key+", donation filter: "+x);

        const donationStats = await analyticsQuery({
            metrics:"ga:uniqueEvents",
            filters:"ga:eventCategory==donations level 1"+(missionary_profile_key == null ? "":(";ga:eventLabel=="+missionary_profile_key)),
        },accessToken);
        if(donationStats && donationStats.rows && donationStats.rows.length==1)
            stats.donationClicks = parseInt(donationStats.rows[0][0]);

        const pageStats = await analyticsQuery({
            metrics:"ga:pageviews",
            filters:"ga:pagePath!@code"+(missionary_profile_key == null ? "":(";ga:pagePath=@/profile-detail/"+missionary_profile_key)),
        },accessToken);
        if(pageStats && pageStats.rows && pageStats.rows.length==1)
            stats.pageViews = parseInt(pageStats.rows[0][0]);

        const prayerStats = await analyticsQuery({
            metrics:"ga:uniqueEvents",
            filters:"ga:eventAction==prayed;ga:pagePath!@code"+(missionary_profile_key == null ? "":(";ga:pagePath=@/profile-detail/"+missionary_profile_key)),
        },accessToken);
        if(prayerStats && prayerStats.rows && prayerStats.rows.length==1)
            stats.prayers= parseInt(prayerStats.rows[0][0]);

    }catch(error){
        console.error("failed to get page stats for profile key "+missionary_profile_key,error);
    }

    //console.log("stats: ",stats);
    return stats;
    
}

export function verifyMailgunRequest(signature){

    console.local("verifying mailgun request");
    const signingKey = process.env.MAILGUN_API_KEY;
    const encodedToken = crypto
        .createHmac('sha256', signingKey)
        .update(signature.timestamp.concat(signature.token))
        .digest('hex')

    return (encodedToken === signature.signature)
}
export async function handleMailgunEvent(eventData){
    console.local("handling mailgun event ",eventData);

    if(eventData.event == null)
        return;
    
    if(eventData.event == "failed")
        console.error("mailgun failure event: ",eventData);

}

export async function cleanUpOldUsers(dryRun=true,count=1){
    // find users who are not in auth and don't have a profile or saved search
    const tenantId = process.env.AUTH_TENANT_ID;
    const usersWithoutEntities = (await getDB().getUsersWithoutEntities());
    console.info("found "+usersWithoutEntities.length+" profileless users");

    console.info("cleaning up users. dryRun? "+dryRun+", count="+count);

    const minAge =new Date(new Date().getTime() -  30*24*60*60*1000); //30 days ago
    var i;

    //see if they exist in authdb
    for( let user of usersWithoutEntities.slice(0,count)){

        console.info((dryRun?"DRY RUN":"LIVE")+" ----- considering user ------------",user);

        //skip any user created in the last 30 days
        if(new Date(user.user_created).getTime() > minAge.getTime()){
            console.info("    skipping user less than 30 days old",user.user_created,minAge);
            continue;
        }

        try{
            const email = await userIdToEmail(user.external_user_id);
            if(email != null){
                user.email = email;
                if(mailingList.userExists(user.email)){
                    console.info("    found user in mailing list",user.first_name, user.last_name, user.user_key)
                    console.info("    deleting user from all ",user.user_key, user.external_user_id);
                    if( ! dryRun){
                        deleteUser(user.external_user_id); // from mailinglist,authdb
                        //deleteUserFromDB(user.user_key);
                    }
                }
            }
        }catch(error){
            console.info("    user not found in auth db, removing from PG");
            //if( ! dryRun)
                //deleteUserFromDB(user.user_key);
        }
        

    };
    console.info("-----------------------------------");
    console.info("fetching mailing list members...");

    //fetch all entries from mailing list and see which ones are in authdb. Delete any not found
    const mailingListEmails = (await mailingList.getAllMemberEmails(count)).members;
    console.info("mailing list emails: ",mailingListEmails);

    for(let email of mailingListEmails){
        //get user from authdb
        email = email.email_address.toLowerCase();

        console.info((dryRun?"DRY RUN":"LIVE")+" ----- considering email: ",email);
        try{
            const authUser= await fusionRequest("GET","/api/user?email="+email,null,
                                        {"X-FusionAuth-TenantId":tenantId});
            console.info("    found mailing list user in auth db",email,authUser.id);

        }catch(error){
            console.info("    failed to find mailing list member "+email+" in auth db");
            if(error.response != null && error.response.status === 404){
                console.info("    removing user from mailing list",email);
                //remove from mailing list
                if( ! dryRun)
                    await mailingList.removeUser(email);
            }else{
                console.error("    error contacting authdb: ",error);
            }
        }
    }
    console.info("-----------------------------------");
}

export async function pickPrayerCardDrawingWinner(){
    try{
        const mailDomain= process.env.MAIL_DOMAIN;
        console.log("picking prayer card winner");
        var user= (await getDB().getUserForPrayerCardDrawing());
        console.log("prayer card winner: ",user);

        const email = await userIdToEmail(user.external_user_id);
        const body = `
${user.first_name},

Congratulations, you've won the drawing this month for a free prayer card mailing! 

Take a look at https://missionmessenger.com/ to get started.
Create an account, then you can use an existing template or use Canva.com and design your own card. 
After that upload your addresses and then place your order. 

To get reimbursed, send a screenshot of your order to andrew.feng@indigitous.org and he'll send you money via Venmo or PayPal.

If for some reason you're not able to take advantage of this offer right now, no worries, just let us know so we can do another drawing. 


- Ergatas
`

        var data = {
            from: "information@"+mailDomain,
            to:  "information@"+mailDomain,
            //to: email,  // for when we make it live
            subject: "You've won the monthly prayer card drawing!",
            text:  body+`\n\n email: ${email}`
                  
        };
        await sendEmail(data);
    }catch(error){
        console.error("failed to pick prayer card winner: ",error);
        throw new AppError("failed to pick prayer card winner");
    }
        
}
export async function sendDonationNotice(possible_transaction_key,external_user_id){

    const mailDomain= process.env.MAIL_DOMAIN;
    try{
        console.log("sendDonationNotice ",possible_transaction_key,external_user_id);
        const email = await userIdToEmail(external_user_id);

        const tx = (await getDB().getPossibleTransaction(possible_transaction_key));
        console.log("tx: ",tx);

        const profile = (await getDB().getDisplayProfileByKey(tx.missionary_profile_key));
        console.log("profile: ",profile);

        const customer = await stripeUtils.getCustomerFromStripeId(tx.stripe_id);
        var message=`${profile.data.first_name},`;

        if(tx.donation_type==="one-time"){
            message += `\n\nYou've received a donation on Ergatas for $${tx.amount}! The money has been transferred to your agency. `

        }else if(tx.donation_type==="recurring"){
            message += `\n\nYou've received a recurring donation on Ergatas for $${tx.amount}/month! The money has been transferred to your agency. `
        }else{
            console.log("unknown donation type: "+tx.donation_type+", donation notice not sent");
            return;
        }
        if(customer != null)
            message += `\n\nYour donor's name is ${customer.name}, email: ${customer.email}`;

        message += `\n\nWould you mind letting us know if you already knew this donor, or if this is a new contact for you? That helps us know how effective we're being at finding workers new contacts. Thanks!\n`;

        //console.log("message: ",message);

        const data = {
            from: "information@"+mailDomain,
            bcc: "information@"+mailDomain,
            to:  email,
            subject: "New Donation on Ergatas!",
            text:  message,
        }
        await sendEmail(data);
    }catch(error){
        console.error("failed to send donation notice: ",error,possible_transaction_key);
        await sendEmail({
            from: "information@"+mailDomain,
            to: "information@"+mailDomain, 
            subject: "Donation Notice Failure",
            text:  `Failed to send donation notice for tx key ${possible_transaction_key} for user ${external_user_id}`,
        });
        throw error;
    }
}
export async function claimOrg(organization_key, church_name, church_website,user_key,read_only,email, userId,adminName){
    console.log("claim submitted for org",organization_key,church_name, church_website,read_only);
    const mailDomain= process.env.MAIL_DOMAIN;
    const org = (await getDB().getOrganization(organization_key));

    //update name data in fusionauth
    await updateFusionUser(userId,email,{fullName:adminName});


    await sendEmail({
        from: "information@"+mailDomain,
        to: "information@"+mailDomain,
        subject: "Organization claim",
        text:` Organization claim

        Add user ${userId} to ProfileManager group.

         org key: ${organization_key}
         org name: ${org.display_name}
         church_name: ${church_name}
         church_website: ${church_website}
         read_only: ${read_only}
         admin name: ${adminName}
         user email: ${email}
         user_key: ${user_key}
         external_user_id: ${userId}`
    });
}
export async function userHasPermissionOnProfile(external_user_id,missionary_profile_key){
    const allowedProfiles = await getManagedProfiles(external_user_id);
    console.log("does user "+external_user_id+" have permission on "+missionary_profile_key,allowedProfiles);
    const match = allowedProfiles.find(p => p.missionary_profile_key === missionary_profile_key);
    console.log("found match: ",match);
    return match != null;
}
export async function getManagedProfiles(external_user_id){
    console.log("getting managed profiles for "+external_user_id);

    const filter = (await getDB().getUserOrgSearchFilter(external_user_id));
    if(filter == null)
        return; // no permissions to manage

    const ro_profile_keys = filter.search_filter.ro_profile_keys || [];
    // remove ro_profile_keys from search_filter so it does not break query later
    delete filter.search_filter.ro_profile_keys;

    const allProfiles = {};
    const user_key = filter.user_key;


    //console.log("running filter: ",filter);
    if(filter != null && filter.search_filter != null){
        // add owned profiles into missionary_profile_keys array
        if(filter.search_filter.missionary_profile_keys == null)
            filter.search_filter.missionary_profile_keys = [];

        filter.search_filter.missionary_profile_keys = 
                filter.search_filter.missionary_profile_keys.
                    concat(filter.owned_profile_keys || []).
                    concat(ro_profile_keys);

        console.debug("managed profiles search params: ",filter.search_filter);
        // run filter, add profile_keys into set, insert into cached_user_permissions
        var profiles =(await getProfilesForFilter(getDB(),filter.search_filter));
        //console.log("profiles:",profiles);

        if(profiles != null)
            for(const profile of profiles){
                allProfiles[profile.missionary_profile_key] = {
                    missionary_name: profile.missionary_name,
                    state: profile.state,
                    published: profile.data.published,
                    missionary_profile_key: profile.missionary_profile_key,
                    organization_display_name: profile.organization_display_name,
                    picture_url: profile.data.picture_url,
                    ro: ro_profile_keys.includes(profile.missionary_profile_key),
                    owned: profile.user_key === user_key,
                }
            }
    }

    if(user_key == null){
        console.warn("in updatePermissions, no filters found");
    }else{
        console.log("updating permission cache for user "+user_key,allProfiles);
        // update cached_user_permissions
        // delete all entries for user_key
        await getDB().clearUserPermissionCache(user_key);

        // insert new entires for each profileKeys, if not read_only
        const rwKeys = Object.values(allProfiles).filter(p => ! p.ro).map(p => p.missionary_profile_key);
        await getDB().cacheUserPermissions(user_key,rwKeys);
    }
    return Object.values(allProfiles);
    
}
export async function grantUserOrgPermission(user_key, organization_key, read_only){

  try{
    await getDB().insertUserProfilePermissions(
                  user_key, organization_key, read_only);
    //also add org to orgs search_filter
    const org = (await getDB().getPlainOrganization(organization_key));
    if(org.search_filter == null)
        org.search_filter={};

    if(org.search_filter.organization_keys == null)
        org.search_filter.organization_keys=[];
    
    if( ! org.search_filter.organization_keys.includes(String(organization_key))){
        org.search_filter.organization_keys.push(String(organization_key));
        await getDB().updateOrganization(organization_key,org);
    }



  }catch(error){
    console.error("grantUserOrgPerm error: ",error);
    throw new AppError(error.message || error);
  }
}
export function subdomainRedirect(res,hostname,page){

    const domain = process.env.DOMAIN;
    let subdomain = hostname.replace(domain,"").replace(".","");
    console.log(` ================ page: ${page}, subdomain: ${subdomain}`);
    //if(subdomain !== "" && orgSlugs[subdomain] != null){
    if(subdomain !== ""){
        if(page == null || page === "")
            page = subdomain;
        console.log(`REDIRECTING from subdomain ${subdomain} to https://${domain}/${page}`)
        res.redirect(`https://${domain}/${page}`);
        return true;
    }
    return false;
}
export async function addROProfile(userId, missionary_profile_key){

    const perms = await getDB().getUserOrgSearchFilter(userId);
    const organization_key = perms.organization_key;
    const org = await getDB().getPlainOrganization(organization_key);

    if(org.search_filter == null)
        org.search_filter={};

    // see if we already have permission on this profile
    if((org.search_filter.missionary_profile_keys != null
            && org.search_filter.missionary_profile_keys.includes(missionary_profile_key) )
        ||(perms.owned_profile_keys != null && perms.owned_profile_keys.includes(missionary_profile_key)) )
        return false;

    if(org.search_filter.ro_profile_keys == null)
        org.search_filter.ro_profile_keys = [];

    console.log("ro keys: ",org.search_filter.ro_profile_keys,missionary_profile_key);
    if( ! org.search_filter.ro_profile_keys.includes(missionary_profile_key)){
        console.log("adding new key to RO keys and saving");
        org.search_filter.ro_profile_keys.push(missionary_profile_key);
        await getDB().updateOrganization(organization_key,org);
        return true;
    }
    return false;

}

export async function txDetails(token,possible_transaction_key){

    const allowedTx= (await getDB(token).getWorkerTransaction(possible_transaction_key));
    if(allowedTx == null || allowedTx.length == 0)
        return {} //Either tx didn't exist, or we don't have permisison on it

    //now get the full tx info, including stripe_id
    const tx = (await getDB().getPossibleTransaction(possible_transaction_key));
    console.log("found tx ",tx);
    if(tx.stripe_id == null || tx.stripe_id === "")
        return {}; //tx not made with stripe

    const customer = await stripeUtils.getCustomerFromStripeId(tx.stripe_id);

    return {
        name: customer.name,
        email: customer.email,
    };
}