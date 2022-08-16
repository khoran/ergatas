import axios from 'axios';
import path from 'path';
import Mailgun from 'mailgun-js';
import jwt from 'jsonwebtoken';
import { AppError } from './app-error.js';
import crypto from 'crypto';
import { DataAccess } from '../shared/data-access.js';
import fs from 'fs';
import {MailingList} from './mailing-list.js';
import cheerio from "cheerio";
import serveStatic from 'serve-static';
import { BlobServiceClient } from '@azure/storage-blob';
import {randomIntBetween} from '../shared/shared-utils.js';
import webPush  from 'web-push';

var mailgun;
var db;
var mailingList;

const messagingAdminEmail = "messaging-admin@ergatas.org";

export function init(){
    mailingList = new MailingList(
                        process.env.MAILCHIMP_KEY,
                        process.env.MAILCHIMP_SERVER_PREFIX,
                        process.env.MAILCHIMP_LIST_ID);
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
export function requireRole(req,role){

    const payload = jwtPayload(req.body.token);
    if(payload == null || payload.roles == null || ! payload.roles.includes(role))
      throw new AppError("Not authorized");

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
export async function updateJPWorkerCache(joshuaProject){

    var peopleGroups = (await getDB().peopleGroupsWithWorkers()).data.map(x=>x.code);
    var countries = (await getDB().countriesWithWorkers()).data.
                              map(x=>x.code.toLowerCase());
    console.log("fetched JP worker data: ",peopleGroups,countries);
    joshuaProject.updateWorkerCache(peopleGroups,countries);

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

const userIdToEmail = async (userId) =>{
    console.local("fetching email for user id "+userId);
    try{
        var x= await fusionRequest("GET","/api/user/"+userId).
            then((response)=>{
                //console.local("user information response: ",response.data,response.data.user);
                return response.data.user.email;
            });
        return x;
    }catch(error){
        //console.local("LOCAL failed to fetch email for userId "+userId,error);
        console.error("failed to fetch email for userId "+userId,error.data);
        throw error;
    }
}
export const getUserEmails = async (userIds) => {
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
const saveEmailMapping = async  function(emailAddress,hash){
    console.info("saving map from "+emailAddress+" to "+hash);

   await getDB().insertEmailHashMapping(emailAddress,hash);

}
async function hashToEmail(hashedEmail){
    console.info("fetching real email for hash "+hashedEmail);
    try{

        var response  = await getDB().getEmailHash(hashedEmail)
        if(response.data != null && response.data.email_address != null){
            console.info("found real email: "+response.data.email_address);
            return response.data.email_address;
        }
    }catch(error){
        console.error("true email not found for hashed email "+hashedEmail,error);
        throw new AppError("true email not found for hashed email "+hashedEmail+"\n"+JSON.stringify(error));
    }
    
}
const contact = async (fromEmail, fromName, message,toEmail) =>{


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

const forwardMessage = async (email) =>{
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
const deleteUser = async (userId,email) =>{

    //delete from MailChimp
    try{
        console.log("removing user "+userId+" from mailchimp");

        mailingList.removeUser(email);
    }catch(error){
        console.warn("failed to remove user from mailing list: "+error.message,error);
    }

    //delete from fusionAuth
    try{
        fusionRequest("DELETE","/api/user/"+userId+"?hardDelete=true");
    }catch(error){
        throw new AppError("failed to delete user id "+userId,error);
    }

}
const checkProfileUpdates = async () =>{
    const disableDays = 8*30; //~8 months
    const warning1Days = disableDays - 30;
    const warning2Days = disableDays - 15;

    const now= new Date();
    const warning1Date = new Date(now - warning1Days*24*60*60*1000);
    const warning2Date = new Date(now - warning2Days*24*60*60*1000); 
    const disableDate = new Date(now - disableDays*24*60*60*1000);
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
    var profilesToDisable = (await getDB().profilesByLastUpdate(warning2Date.toISOString())).data

    //console.log("profiles to disable: ",profilesToDisable);
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

    console.info("stats: ",stats);
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

const addUserToMailinglist = async function(email){
    console.log("adding new user to mailing list ",email);

    try{
        await mailingList.ensureUser(email);
        await mailingList.addTags(email,["User"]);
    }catch(error){
        console.warn("failed to add or set tag for new User "+email+": "+error.message,error);
    }
}
const newsletterSignup = async function(firstName,lastName,email,addToPrayerList,recaptchaScore,dailyPrayer,mobilizer){
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
    /* not here, when we have first publish
    try{
        var profile = (await getDB().getProfileByKey(missionary_profile_key)).data;
        return profile;
    }catch(error){
        console.warn("failed to fetch newly created profile "+missionary_profile_key);
    }
    return null;
    */
}
export async function getMissionaryProfile(missionary_profile_key){
    return (await getDB().getProfileByKey(missionary_profile_key)).data;
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
const buildIndex = async function(pageName,info,url){

    //console.local("building index for page "+pageName,info);
    const __dirname = path.resolve();
    const index= fs.readFileSync(`${__dirname}/lib/page-templates/index.html`,'utf-8');
    const subdir = info.path || "";
    const page_template = fs.readFileSync( `${__dirname}/lib/page-templates/${subdir}${pageName}.html` ,'utf-8');

    var missionary_profile_key,profile;
    var canonicalUrl;
    const domain = process.env.DOMAIN;
    const bucketName = process.env.UPLOAD_BUCKET;
    const bucketBaseUrl= process.env.BUCKET_BASE_URL;
    const bucketBase=bucketBaseUrl+"/"+bucketName+"/";

    const $ = cheerio.load(index);


    if(info && info.prerender !== false)
        $("#page_content").append(page_template);


    if(pageName === "home" || pageName ==="index" || pageName==="coming-soon")
        pageName=""; //set to root page
    if(info.path != null){
        //canonicalUrl=`https://ergatas.org/${info.path}${pageName}`;
        canonicalUrl=`https://${domain}/${info.path}${pageName}`;
    }else
        canonicalUrl=`https://${domain}/${pageName}`;

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
        if(info && info.sharing_image){
            var image_url=`https://${domain}${info.sharing_image}`;
            $("meta[property='twitter:image']").attr("content",image_url);
            $("meta[property='og:image']").attr("content",image_url);
            $("meta[property='og:image:width']").remove();
            $("meta[property='og:image:height']").remove();
        }
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
export async function randomMissionary(){
    const profile = (await getDB().randomSharableProfile()).data;
    //console.local("got random profile ",profile);
    return profile;
}

export async function getPushSubscription(push_subscription_key){
    try{
       return (await getDB().getPushSubscription(push_subscription_key)).data.subscription;
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
      subscriptions = (await getDB().getPushSubscriptions(["daily_prayer_list"])).data
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
   const emailHtml= fs.readFileSync(process.cwd()+"/lib/snippet-templates/mod-email.html","utf8");
   const settings={
                subject_line: "Ergatas Missionary of the Day",
                preview_text: `Pray for the ministry of ${profile.author}`,
                from_name: "Ergatas",
                reply_to: "information@ergatas.org",
             };

   const $ = cheerio.load(emailHtml);

   $("#name").html(profile.author);
   $(".profile_link").attr("href",profile.url);
  


   if(profile.enclosure && profile.enclosure.url){
      $("#image").attr("src",profile.enclosure.url);
      $("#image").attr("alt",profile.author);
   }else{
      $("#image_row").html("");
   }
   content = $.html();

   console.local("content: ",content);
   mailingList.sendCampaign("missionary of the day",content,settings);
}
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
      const users = (await getDB().getUsersWithDonation(start,end)).data;
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
   var messageInfo = (await getDB().getMessage(messageQueueKey)).data;
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
   return (await getDB().getAllMessages()).data;
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
        console.error("failed to get analytics refresh token",error);
    }

}
async function analyticsQuery(params,accessToken){
    const viewId =process.env.GOOGLE_ANALYTICS_VIEW_ID;
    try{
        params.ids="ga:"+viewId;
        params['start-date']="2020-01-01"; // start of data collection
        params['end-date']="today";
        
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
        console.error("failed to get analytics refresh token",error);
    }
}

export async function getProfileStats(missionary_profile_key){
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
        if(donationStats.rows && donationStats.rows.length==1)
            stats.donationClicks = donationStats.rows[0][0];

        const pageStats = await analyticsQuery({
            metrics:"ga:pageviews",
            filters:"ga:pagePath!@code"+(missionary_profile_key == null ? "":(";ga:pagePath=@/profile-detail/"+missionary_profile_key)),
        },accessToken);
        if(pageStats.rows && pageStats.rows.length==1)
            stats.pageViews = pageStats.rows[0][0];

        const prayerStats = await analyticsQuery({
            metrics:"ga:uniqueEvents",
            filters:"ga:eventAction==prayed;ga:pagePath!@code"+(missionary_profile_key == null ? "":(";ga:pagePath=@/profile-detail/"+missionary_profile_key)),
        },accessToken);
        if(prayerStats.rows && prayerStats.rows.length==1)
            stats.prayers= prayerStats.rows[0][0];

    }catch(error){
        console.error("failed to get page stats for profile key "+missionary_profile_key,error);
    }

    //console.log("stats: ",stats);
    return stats;
    
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
