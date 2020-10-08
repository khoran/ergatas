import axios from 'axios';
import path from 'path';
import Mailgun from 'mailgun-js';
import jwt from 'jsonwebtoken';
import storagePkg from '@google-cloud/storage';
import { AppError } from './app-error.js';
import crypto from 'crypto';
import { DataAccess } from './data-access.js';
import fs from 'fs';
import mailchimp  from "@mailchimp/mailchimp_marketing";
import cheerio from "cheerio";
import serveStatic from 'serve-static';
const {Storage} = storagePkg;

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
        console.local("login data: ",response.data);
        return loginDataFromToken(response.data.access_token);
    }).catch((error) =>{
        console.error("caught error: ",error);
        throw error;
    });

};
const refreshJWT = async (token)=>{
    const fusionUrl= process.env.FUSION_BASE_URL;
    console.local("refreshJWT: "+token);
    var payload = jwtPayload(token);
    var userId = payload.sub;
    //var result = await fusionRequest("GET","/api/jwt/refresh?userId="+userId);
    var result = await axios({
        method: "GET",
        url: fusionUrl+"/api/jwt/refresh",
        headers: {
            'Authorization':"Bearer "+token
        }
    });


    console.local(" refresh result: ",result.data);
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
const jwtPayload = (token) => {
    const secret = process.env.JWT_SECRET;
    //console.log("token:",token);
    if(secret == null || secret==="")
        throw new AppError("no secret given, cannot verify JWT");
    return jwt.verify(token,secret);
}
const getUserKey = (token) =>{
    var payload = jwtPayload(token);
    return payload.sub;
 
}


const getSignedUploadUrl = async (userId,filename) =>{

    const maxFilesPerUser = process.env.MAX_USER_FILES ;
    const userBucket = getUploadBucket();
    var file = userBucket.file(userId+"/"+filename);

    const existingFileCount =  await countExistingUserFiles(userId,userBucket);
    if(existingFileCount + 1 > maxFilesPerUser){
        console.warn("for user "+userId+", found "+existingFileCount+
            " files, current upload would exceed max file count of "+maxFilesPerUser);
        return null;
    }

    //-
    // Generate a URL that allows temporary access to download your file.
    //-
    var expireDate = new Date();
    expireDate.setTime(expireDate.getTime() + 60 * 60* 1000); // 1 hour in milliseconds

    var config = {
        expires: expireDate.getTime(),
        action: 'write',
        version: 'v4',
    };

    return file.getSignedUrl(config).
        then( (data) =>{
            //console.log("signed url data:", data);
            return data[0];

        } ); 

};
const removeFile = (userId,filename) =>{
    return getUploadBucket().file(userId+"/"+filename).delete();
}
const removeAllFiles =  async (userId,filename) =>{
    var files = await getUserBucketFiles(userId);
    return Promise.all(files.map( (file) =>{
        return file.delete();
    }));
}
const getUserBucketFiles = async (userId,bucket) =>{
    const userBucket = bucket || getUploadBucket();
    var data= await userBucket.getFiles({
        autoPaginate: false,
        delimiter: '/',
        prefix: userId+'/'
    });
    return data[0];
}
const getUploadBucket = () =>{
    const uploadBucketName = process.env.UPLOAD_BUCKET  || "ergatas-public";
    const storage = new Storage();
    return storage.bucket(uploadBucketName);
}
const userFileLinks = async (userId) =>{
    var files = await getUserBucketFiles(userId);
    var filenames = files.map(file => 
        {
            return {
                name: file.metadata.name.replace(userId+'/',"" ),
                link: file.metadata.mediaLink,
            };
        });
    console.log("filenames: ",filenames);
    return filenames;
}
const countExistingUserFiles = async (userId,bucket) =>{
    var files = await getUserBucketFiles(userId,bucket);
    console.log("found "+files.length+" existing files for user id"+userId);
    return files.length;
};
const nonProfitSearch = async (query) =>{

    return axios.get("https://projects.propublica.org/nonprofits/api/v2/search.json?c_code[id]=3&q="+query).
        then(function(response){
            return response.data;
        }).catch( (error) =>{
            console.warn(" nonprofit query failed for "+query);
            throw error;
        });

};
const notifyOrgApplication = async (user_key, organization_key) => {
    const orgNotifyEmail = process.env.ORG_APP_NOTIFY_EMAIL;
    const baseUrl = process.env.REDIRECT_URL;

    const data = {
        from: "information@ergatas.org",
        to: orgNotifyEmail,
        subject: "New Organization Application",
        text: "User "+user_key+" has submitted a  new organization for approval.\n "+
                baseUrl+"organization-review/"+organization_key,
    };
    try{
        var body = await sendEmail(data);
        console.log("org application notification email sent!");
    }catch(error){
        console.error("org application notification email failed: ",error);
        throw new AppError("failed to send org application notification message");
    }

};
const notifyOrgUpdate = async (token,organization_key) => {
    //fetch list of external_user_ids from orgaization_listeners_to_notify
    // send either approved or denied email
    
    const org = (await getDB(token).getOrganization(organization_key)).data;
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
        emailText =  "Unfortunately, we don't feel that this organization sufficiently agrees with our statement of faith, and "+
                  "is therefore not eligible to be included on Ergatas. If you feel this is an error, feel free to reply to "+
                  "this email explaining why. You can also review our statement of faith at ergatas.org/sof .";

    }else{
        throw new AppError("organization "+organization_key+" has not been marked as approved or denied yet");
    }

    const emailData = {
        from: "information@ergatas.org",
        subject: "Ergatas Application for "+org.name,
        html: emailHtml,
        text: emailText
    };
    const users = (await getDB(token).selectOrganizationListeners(organization_key)).data;
    for(var i in users){
        var user = users[i];
        console.log("sending org status update email to "+user.external_user_id);
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
            //console.log("user information response: ",response.data,response.data.user);
            return response.data.user.email;
        });
}
const emailToHash=function(emailAddress){
    return "user_"+crypto.createHash("md5").update(emailAddress).digest("hex")+"@ergatas.org";
}
const saveEmailMapping =  function(emailAddress,hash){
    console.log("saving map from "+emailAddress+" to "+hash);

   // return dbRequest("post","/email_hashes_view?on_conflict=email_address",{
   //     email_address:emailAddress,
   //     hashed_email_address:hash
   // },{
   //     'Prefer': "resolution=ignore-duplicates",
   // });
   getDB().insertEmailHashMapping(emailAddress,hash);

}
async function hashToEmail(hashedEmail){
    console.log("fetching real email for hash "+hashedEmail);
    //TODO: catch not found error here
    var response  = await getDB().getEmailHash(hashedEmail)
    if(response.data != null && response.data.email_address != null){
        console.log("found real email: "+response.data.email_address);
        return response.data.email_address;
    }
    console.error("true email not found for hashed email "+hashedEmail);
    return null;
}
const contact = async (fromEmail, fromName, message,toEmail) =>{


    const fromHash=emailToHash(fromEmail);
    const toHash=emailToHash(toEmail);

    //await saveEmailMapping(fromEmail,"Ergatas - "+fromName+" <"+fromHash+">");
    //await saveEmailMapping(toEmail,"Ergatas - "+fromName+" <"+toHash+">");
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
    console.log("first contact mailgun data: ",data);
    try{
        var body = await sendEmail(data);
        console.log("message email sent!");
    }catch(error){
        console.error("failed to send message from user to missionary. "+error.message,error);
        throw new AppError("failed to send message");
    }
}

const forwardMessage = async (email) =>{
    console.log("fowarding message: ");
    // lookup hashed 'to' address in database to get true email address
    // also rewrite 'from' to be hashed
    const realToEmail = await hashToEmail(email.recipient);
    const hashedFrom = emailToHash(email.sender);
    const fromName = email.From.replace(/(.*?) <.*>$/,"$1") || "";
    console.log("From : "+email.From+", extracted name: "+fromName);
    const data = {
        //from: hashedFrom,
        from: "Ergatas - "+fromName+" <"+hashedFrom+">",
        to: realToEmail,
        subject: email.subject,
        text: email['body-plain'],
        html: email['body-html'],
    };
    console.log("forward mailgun data: ",data);

    try{
        var body = await sendEmail(data);
        console.log("message email sent!");
    }catch(error){
        console.error("failed to send message from user to missionary. "+error.message,error);
        throw new AppError("failed to send message");
    }

}
const deleteUser = (userId) =>{

    return fusionRequest("DELETE","/api/user/"+userId+"?hardDelete=true").
        catch((error)=>{
            throw new AppError("failed to delete user id "+userId,error);
        });

}
const checkProfileUpdates = async () =>{
    const warning1Days = 30;
    const warning2Days = 45;
    const disableDays = 60;
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
        "It looks like it's been over 30 days since your last profile update! "+
        " For best results, it's important to keep your profile up to day, particularly your current support level. "+
        " Go to ergatas.org/profile to make your updates. If nothing has changed, just click the 'Save' button to indicate that."+
        " If no updates are made for 60 days, your profile will no longer be shown in search results. "
    );
}
const emailWarning2Notice = (userId) =>{
    return emailUpdateNotice(userId,"update-reminder-2.html",
        "It looks like it's been over 45 days since your last profile update! "+
        " For best results, it's important to keep your profile up to day, particularly your current support level. "+
        " Go to ergatas.org/profile to make your updates. If nothing has changed, just click the 'Save' button to indicate that."+
        " If no updates are made for 60 days, your profile will no longer be shown in search results. "
    );
}
const emailDisableNotice = (userId) =>{
    return emailUpdateNotice(userId,"profile-disabled.html",
        "It looks like it's been over 60 days since your last profile update! "+
        " Your profile has now been disabled and will not be shown in search results. "+
        " To re-activate your profile, go to ergatas.org/profile, make any updates, then click 'Save'"
    );
}
const emailUpdateNotice = async (userId,templateName,textVersion) =>{
    var email ;
    var emailTemplate;
    
    try{
        email = await userIdToEmail(userId);
        console.log("got user email: "+email);
    }catch(error){
        console.log("failed to get email for user id "+userId+". "+error.message);
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
        from: "information@ergatas.org",
        to: email,
        subject: "Ergatas Profile update reminder - Action Needed",
        text: textVersion,
        html: emailTemplate,
    };
    //console.log("update notice mailgun data: ",data);

    try{
        var body = await sendEmail(data);
        console.log("update notice message email sent!");
    }catch(error){
        console.error("failed to send update notice email to userId"+userId+", with email "+email+
            ". "+error.message,error);
        throw new AppError("failed to send update notice message");
    }

}

const newsletterSignup = function(firstName,lastName,email,addToPrayerList){
    console.log("doing newsletter signup ",firstName, lastName, email,addToPrayerList);

    const listId= process.env.MAILCHIMP_LIST_ID;
    const mailchimp = getMailchimp();

    if(addToPrayerList){
        sendEmail({
            from: "web@ergatas.org",
            to: "information@ergatas.org",
            subject: "request to add to prayer list",
            text: "Please add "+firstName+" "+lastName+", "+email+
                " to the prayer list",
        });
    }

    return mailchimp.lists.addListMember(listId, {
        email_address: email,
        status: "subscribed",
        merge_fields: {
          FNAME: firstName,
          LNAME: lastName
        }
      });
}
const sendMessage= function(name,email,message){
    return sendEmail({
            from: "web@ergatas.org",
            to: "information@ergatas.org",
            subject: "Contact Form Message",
            text: "Message from: "+name+", "+email+"\n\n"+message,
        });
}
const buildIndex = function(pageName,info){

    console.log("building index for page "+pageName,info);
    const __dirname = path.resolve();
    const index= fs.readFileSync(`${__dirname}/lib/page-templates/index.html`,'utf-8');
    const page_template = fs.readFileSync( `${__dirname}/lib/page-templates/${pageName}.html` ,'utf-8');

    const $ = cheerio.load(index);
    $("#page_content").append(page_template);
    if(info && info.title)
        $("title").html(info.title);
    if(info && info.description)
        $("meta[name=description]").attr("content",info.description);
    return $.html();

}
function setCustomCacheControl(res, path) {
    if (serveStatic.mime.lookup(path).startsWith('image/')) {
        //cache images for 1 day
        res.setHeader('Cache-Control', 'public, max-age='+(24*60*60*1000));
    }
}

export {
  getJWT, 
  getSignedUploadUrl, 
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
};
