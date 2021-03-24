import axios from 'axios';
import path from 'path';
import Mailgun from 'mailgun-js';
import jwt from 'jsonwebtoken';
import { AppError } from './app-error.js';
import crypto from 'crypto';
import { DataAccess } from './data-access.js';
import fs from 'fs';
import mailchimp  from "@mailchimp/mailchimp_marketing";
import cheerio from "cheerio";
import serveStatic from 'serve-static';
import { BlobServiceClient } from '@azure/storage-blob';

var mailgun;
var db;
var mailchimpConfigured=false;

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
function getMailchimp(){
    if(mailchimpConfigured === false){
        const key = process.env.MAILCHIMP_KEY; 
        const prefix= process.env.MAILCHIMP_SERVER_PREFIX; 

        mailchimp.setConfig({
            apiKey: key,
            server: prefix,
        });
        mailchimpConfigured=true;
    }
    return mailchimp;
}
function sendEmail(data){
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
function loginDataFromToken(token){
    
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
const jwtPayload = (token) => {
    const secret = process.env.JWT_SECRET;
    //console.local("token:",token);
    if(secret == null || secret==="")
        throw new AppError("no secret given, cannot verify JWT");

    return jwt.verify(token,secret);

}
const getJWT = async (code) => {

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
const refreshJWT = async (refresh_token)=>{
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
const getDB = (token) =>{
    const postgrestBase= process.env.POSTGREST_SERVER_URL_BASE;
    const secret = process.env.JWT_SECRET;
    if(token == null){

        token = jwt.sign({
                role: 'ergatas_server'
            },secret,{ expiresIn: 60 })
    }
    
    const db = new DataAccess(postgrestBase,axios);
    db.setToken(token);
    return db;
}

const getUserKey = (token) =>{
    var payload = jwtPayload(token);
    return payload.sub;
 
}



const removeFile = (userId,filename) =>{
    const bucket = getUploadBucket();
    return bucket.deleteBlob(userId+"/"+filename);
}
const removeAllFiles =  async (userId) =>{
    const bucket = getUploadBucket();
    var files = await getUserBucketFiles(userId);
    return Promise.all(files.map( (file) =>{
        return bucket.deleteBlob(file.name);
    }));
}
const getUserBucketFiles = async (userId,bucket) =>{
    const userBucket = bucket || getUploadBucket();
    var blobs = [];

    for await (const blob of userBucket.listBlobsFlat({prefix:userId+"/"})) {
        blobs.push(blob);
    }

    return blobs;
}
const getUploadBucket = () =>{
    const uploadBucketName = process.env.UPLOAD_BUCKET ;
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    return blobServiceClient.getContainerClient(uploadBucketName);
}
const userFileLinks = async (userId) =>{
    const bucket = getUploadBucket();
    var files = await getUserBucketFiles(userId);
    var filenames = files.map(file => 
        {
            return {
                name: file.name.replace(userId+'/',"" ),
                link: bucket.url+"/"+file.name
            };
        });
    //console.log("filenames: ",filenames);
    return filenames;
}
const nonProfitSearch = async (query,state) =>{
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
const notifyOrgApplication = async (user_key,external_user_id, organization_key) => {
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
const notifyOrgUpdate = async (token,organization_key,message) => {
    //fetch list of external_user_ids from organization_listeners_to_notify
    // send either approved or denied email
    
    const org = (await getDB(token).getOrganization(organization_key)).data;
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
    const users = (await getDB(token).selectOrganizationListeners(organization_key)).data;
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

//Elastic search seems to choke on expressions like [null].
const nullArrayEl = (a) => a != null && a.prop && a.prop.constructor === Array && a.length === 1 && a[0] == null;
const recordLog = (indexName,logs) =>{
    const esURL = process.env.ELASTIC_SEARCH_URL;

    if(esURL == null)
        throw new AppError("no ES url given");


    var data = logs.map(log =>{
        //console.local(JSON.stringify(log,null,4));
        //if(nullArrayEl(log.additionalInformation)) //doesn't seem to help so far
            //log.additionalInformation = ["null"];
        return "{\"create\":{}}\n"+JSON.stringify(log)+"\n";
    }).join("");

    // /<INDEX_NAME-{now/d}>
    return axios.post(esURL+"/%3C"+indexName+"-%7Bnow%2Fd%7D%3E/_bulk/",data,
        {
            headers: {
                "Content-Type":"application/x-ndjson",
            }
        }).then((response)=>{
            if(response.error != null && response.error.reason != null){
                throw new AppError("Failed to record batch of log messages: "+response.error.reason);
            }
        }).catch((error) =>{
            console.error("Failed to record batch of log messages to "+esURL+", ",error.message);
            throw error;
        });


}
const validateRecaptcha = async (token,action,remoteIp) =>{

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

const userIdToEmail = (userId) =>{

    return fusionRequest("GET","/api/user/"+userId).
        then((response)=>{
            //console.local("user information response: ",response.data,response.data.user);
            return response.data.user.email;
        });
}
export const isUserVerified = (userId) =>{
    return fusionRequest("GET","/api/user/"+userId).
        then((response)=>{
            return {verified:  response.data.user.verified};
        });
}
export const resendVerifyEmail= (email) =>{
    const tenantId = process.env.AUTH_TENANT_ID;
    return fusionRequest("PUT","/api/user/verify-email?email="+email,null,{
        "X-FusionAuth-TenantId":tenantId
    });
}

const emailToHash=function(emailAddress){
    const mailDomain= process.env.MAIL_DOMAIN;
    return "user_"+crypto.createHash("md5").update(emailAddress).digest("hex")+"@"+mailDomain;
}
const saveEmailMapping =  function(emailAddress,hash){
    console.info("saving map from "+emailAddress+" to "+hash);

   // return dbRequest("post","/email_hashes_view?on_conflict=email_address",{
   //     email_address:emailAddress,
   //     hashed_email_address:hash
   // },{
   //     'Prefer': "resolution=ignore-duplicates",
   // });
   getDB().insertEmailHashMapping(emailAddress,hash);

}
async function hashToEmail(hashedEmail){
    console.info("fetching real email for hash "+hashedEmail);
    //TODO: catch not found error here
    var response  = await getDB().getEmailHash(hashedEmail)
    if(response.data != null && response.data.email_address != null){
        console.info("found real email: "+response.data.email_address);
        return response.data.email_address;
    }
    console.error("true email not found for hashed email "+hashedEmail);
    return null;
}
const contact = async (fromEmail, fromName, message,toEmail) =>{


    const fromHash=emailToHash(fromEmail);
    const toHash=emailToHash(toEmail);

    await saveEmailMapping(fromEmail,fromHash);
    await saveEmailMapping(toEmail,toHash);

//    const origEmail = await hashToEmail(fromHash);
//    console.log("origEmail result: ",origEmail);
//    console.log("fromEmail: "+fromEmail+", hashed: "+fromHash+", back to orig: "+origEmail);
//    return;
//
    const data = {
        from: "Ergatas - "+fromName+" <"+fromHash+">",
        //from: fromHash,
        to: toEmail,
        subject: fromName+" sent you a message on Ergatas",
        text: message
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

const forwardMessage = async (email) =>{
    console.info("forwarding message from "+email.sender+" to "+email.recipient);
    // lookup hashed 'to' address in database to get true email address
    // also rewrite 'from' to be hashed
    const realToEmail = await hashToEmail(email.recipient);
    const hashedFrom = emailToHash(email.sender);
    const fromName = email.From.replace(/(.*?) <.*>$/,"$1") || "";
    console.info("From : "+email.From+", extracted name: "+fromName);
    if(email['attachment-count'] != null){
        console.info("attachments found: "+email['attachment-count'])
    }
    const data = {
        //from: hashedFrom,
        from: "Ergatas - "+fromName+" <"+hashedFrom+">",
        to: realToEmail,
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
const deleteUser = async (userId) =>{

    //delete from MailChimp
    try{
        console.log("removing user "+userId+" from mailchimp");
        const listId= process.env.MAILCHIMP_LIST_ID;
        const mailchimp = getMailchimp();
        const email = await userIdToEmail(userId);
        const emailHash = crypto.createHash("md5").update(email).digest("hex");
        const listMember=await mailchimp.lists.getListMember(listId,emailHash);

        // if user has only the single tag "User", then remove
        if(listMember.tags_count === 1 && listMember.tags[0].name==="User"){
            await mailchimp.lists.deleteListMember(listId,emailHash);
        }
    }catch(error){
        console.warn("failed to remove user from mailchimp: "+JSON.stringify(error),error);
    }

    //delete from fusionAuth
    return fusionRequest("DELETE","/api/user/"+userId+"?hardDelete=true").
        catch((error)=>{
            throw new AppError("failed to delete user id "+userId,error);
        });

}
const checkProfileUpdates = async () =>{
    const disableDays = 120; //~4 months
    const warning1Days = disabledDays - 30;
    const warning2Days = disabledDays - 15;
    const now= new Date();
    const warning1Date = new Date(now - warning1Days*24*60*60*1000);
    const warning2Date = new Date(now - warning2Days*24*60*60*1000); 
    const disableDate = new Date(now - disableDays*24*60*60*1000);
    const stats = {
        disabled: {success: 0, failed:0},
        warning1Sent: {success: 0, failed:0},
        warning2Sent: {success: 0, failed:0},
    };
    //console.log("now: "+now.toISOString());
    //console.log("warning 1 date: "+warning1Date.toISOString());
    //console.log("warning 2 date: "+warning2Date.toISOString());
    //console.log("disable date: "+disableDate.toISOString());


    var processProfile = ( newState,emailNoticeFn,stat)=>{
        console.log("creating function for state "+newState);
        return async (profile) =>{
            try{
                console.log("======= processing profile for targetState "+newState,profile);
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
    var profilesToDisable = (await getDB().profilesByLastUpdate(warning2Date.toISOString())).data
    console.log("profiles to disable: ",profilesToDisable);
    if(profilesToDisable != null)
        await Promise.all(profilesToDisable.
                    map(processProfile("disabled",emailDisableNotice,stats.disabled)));


    //warning 2 accounts
    var warning2Profiles= (await getDB().profilesByLastUpdate(warning2Date.toISOString())).data
    //console.log("profiles in warning2: ",warning2Profiles);
    if(warning2Profiles != null)
        await Promise.all(warning2Profiles.
                    filter(profile => profile.state === "warning1").
                    map(processProfile("warning2",emailWarning2Notice,stats.warning2Sent)));


    //warning 1 accounts
    var warning1Profiles= (await getDB().profilesByLastUpdate(warning1Date.toISOString())).data
    //console.log("profiles in warning1: ",warning1Profiles);
    if(warning1Profiles != null)
        await Promise.all(warning1Profiles.
                    filter(profile => profile.state === "current").
                    map(processProfile("warning1",emailWarning1Notice,stats.warning1Sent)));

    console.log("stats: ",stats);
    return stats;

}
const emailWarning1Notice = (userId) =>{
    return emailUpdateNotice(userId,"update-reminder-1.html",
        "It looks like it's been over 3 months since your last profile update! "+
        " For best results, it's important to keep your profile up to day, particularly your current support level. "+
        " Go to ergatas.org/profile to make your updates. If nothing has changed, just click the 'Save' button to indicate that."+
        " If no updates are made for 4 months, your profile will no longer be shown in search results. "
    );
}
const emailWarning2Notice = (userId) =>{
    return emailUpdateNotice(userId,"update-reminder-2.html",
        "It looks like it's been over three and half months since your last profile update! "+
        " For best results, it's important to keep your profile up to day, particularly your current support level. "+
        " Go to ergatas.org/profile to make your updates. If nothing has changed, just click the 'Save' button to indicate that."+
        " If no updates are made for 4 months, your profile will no longer be shown in search results. "
    );
}
const emailDisableNotice = (userId) =>{
    return emailUpdateNotice(userId,"profile-disabled.html",
        "Oh no! It looks like it's been over 4 months since your last profile update! "+
        " Your profile has now been disabled and will not be shown in search results. "+
        " To re-activate your profile, go to ergatas.org/profile, make any updates, then click 'Save'"
    );
}
const emailUpdateNotice = async (userId,templateName,textVersion) =>{
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
        subject: "Ergatas Profile update reminder - Action Needed",
        text: textVersion,
        html: emailTemplate,
    };
    //console.log("update notice mailgun data: ",data);

    try{
        var body = await sendEmail(data);
        console.info("update notice message email sent to "+userId);
    }catch(error){
        console.error("failed to send update notice email to userId"+userId+", with email "+email+
            ". "+error.message,error);
        throw new AppError("failed to send update notice message");
    }

}

const addUserToMailinglist = async function(email){
    const listId= process.env.MAILCHIMP_LIST_ID;
    const mailchimp = getMailchimp();
    const emailHash = crypto.createHash("md5").update(email).digest("hex");
    console.log("adding new user to mailing list ",email,emailHash);

    try{
        //see if user is on list already, throws an exception if missing
        await mailchimp.lists.getListMember(listId,emailHash);
        await mailchimp.lists.updateListMemberTags(listId,emailHash,{
            tags: [{name:"User",status:"active"}]
        });
    }catch(error){
        console.log("user not found on list already, adding new entry");
        //if we got an error, user was not on list, so add them
        try{
            await mailchimp.lists.addListMember(listId, {
                email_address:email,
                status:"subscribed",
                tags: ["User"],
            });
        }catch(error){
            //not a fatal error if we fail here
            console.warn("failed to add or set tag for new User "+email+": "+error.message,error);
        }
    }
}
const newsletterSignup = function(firstName,lastName,email,addToPrayerList,recaptchaScore){
    console.info("doing newsletter signup. score: "+recaptchaScore+". ",firstName, lastName, email,addToPrayerList);

    const listId= process.env.MAILCHIMP_LIST_ID;
    const mailchimp = getMailchimp();
    const tags = ["Newsletter"];


    if(addToPrayerList){
        tags.push("Prayer List");
    }

    return mailchimp.lists.addListMember(listId, {
        email_address: email,
        status: "subscribed",
        tags: tags,
        merge_fields: {
          FNAME: firstName,
          LNAME: lastName
        }
      });
}
const sendMessage= function(name,email,message){
    const mailDomain= process.env.MAIL_DOMAIN;
    return sendEmail({
            from: "web@"+mailDomain,
            "h:Reply-To":email,
            to: "information@"+mailDomain,
            subject: "Contact Form Message",
            text: "Message from: "+name+", "+email+"\n\n"+message,
        });
}
const buildIndex = async function(pageName,info,url){

    console.log("building index for page "+pageName,info);
    const __dirname = path.resolve();
    const index= fs.readFileSync(`${__dirname}/lib/page-templates/index.html`,'utf-8');
    const page_template = fs.readFileSync( `${__dirname}/lib/page-templates/${pageName}.html` ,'utf-8');

    var missionary_profile_key,profile;
    var canonicalUrl;
    const bucketName = process.env.UPLOAD_BUCKET;
    const bucketBaseUrl= process.env.BUCKET_BASE_URL;
    const bucketBase=bucketBaseUrl+"/"+bucketName+"/";

    const $ = cheerio.load(index);


    if(info && info.prerender !== false)
        $("#page_content").append(page_template);


    if(pageName === "home" || pageName ==="index" || pageName==="coming-soon")
        pageName=""; //set to root page
    if(info.path != null){
        canonicalUrl=`https://ergatas.org/${info.path}${pageName}`;
    }else
        canonicalUrl=`https://ergatas.org/${pageName}`;

    if(pageName==="profile-detail" && url != null){
        try{
            //set title to worker name and picture to profile picture
            var matches = url.match(/\/(\d+)(?:\?.*)?$/);
            if(matches.length >= 2){
                missionary_profile_key = matches[1];
                canonicalUrl = canonicalUrl+"/"+missionary_profile_key;
                profile = (await getDB().getProfileByKey(missionary_profile_key)).data;
                //console.local("profile: ",profile);

                $("title").html("Ergatas Profile - "+profile.missionary_name);
                if(profile.data.picture_url){
                    $("meta[property='twitter:image']").attr("content",bucketBase+profile.data.picture_url);
                    $("meta[property='og:image']").attr("content",bucketBase+profile.data.picture_url);
                    $("meta[property='og:image:width']").attr("content","400");
                    $("meta[property='og:image:height']").attr("content","400");
                }
            }else
                console.warn("failed to parse missionary_profile_key out of url "+url);
        }catch(error){
            console.local("failed to add worker specific info to meta tags on profile-detail page: "+error.message,error);

            console.error("failed to add worker specific info to meta tags on profile-detail page: "+error.message,error);
            if(info && info.title)
                $("title").html(info.title);
        }
    }else{
        if(info && info.title)
            $("title").html(info.title);
    }

    $("head").append(`<link rel="canonical" href='${canonicalUrl}' />`);

    if(info && info.description)
        $("meta[name=description]").attr("content",info.description);

    if(info && info.indexed===false){
        $("head").append("<meta name='robots' content='noindex'/>");    
    }
    return $.html();

}
function setCustomCacheControl(res, path) {
    if (serveStatic.mime.lookup(path).startsWith('image/')) {
        //cache images for 1 day
        res.setHeader('Cache-Control', 'public, max-age='+(24*60*60*1000));
    }
}
function validOrigin(req){

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
            const profileKeys = (await getDB().getAllProfileKeys()).data;
            profileKeys.forEach( profile => {
                urls.push(`/profile-detail/${profile.missionary_profile_key}`);
            });
        }catch(error){
            console.error("failed to get profile-detail urls from DB",error);
        }

        return urls;

    };

}

export {
  getJWT, 
  nonProfitSearch,
  jwtPayload,
  notifyOrgApplication,
  notifyOrgUpdate,
  removeFile,
  removeAllFiles,
  userFileLinks,
  recordLog,
  validateRecaptcha,
  userIdToEmail,
  contact,
  forwardMessage,
  deleteUser,
  loginDataFromToken,
  checkProfileUpdates,
  sendMessage,
  newsletterSignup,
  buildIndex,
  setCustomCacheControl,
  refreshJWT,
  validOrigin,
  addUserToMailinglist,
};
