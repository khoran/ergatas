import axios from 'axios';
import Mailgun from 'mailgun-js';
import jwt from 'jsonwebtoken';
import storagePkg from '@google-cloud/storage';
//import { AppError } from './app-error';
import crypto from 'crypto';


const {Storage} = storagePkg;

var mailgun;
var db;

function getMailgun(){
    if(mailgun == null){
        const api_key = process.env.MAILGUN_API_KEY;
        const domain = process.env.MAILGUN_DOMAIN;
        if(api_key == null || api_key === '')
            throw new Error("no api_key defined for Mailgun");
        if(domain == null || domain === '')
            throw new Error("no domain defined for Mailgun");

        mailgun = Mailgun({apiKey: api_key, domain: domain});
    }
    return mailgun;
}
function dbRequest(type,url,data,extraHeaders){
    const postgrestBase= process.env.POSTGREST_URL_BASE;
    const secret = process.env.JWT_SECRET;
    const token = jwt.sign({
        role: 'ergatas_server'
    },secret,{ expiresIn: 60 });
    var headers = {};
    if(extraHeaders != null)
        headers = extraHeaders;
   
    headers['Authorization']= "Bearer "+token;
    headers['Content-Type']= "application/json";

    return axios({
        method: type,
        url: postgrestBase+url,
        data: data,
        headers: headers,
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
    console.log("token payload: ",payload);

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
        throw new Error("no code given");
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
        return loginDataFromToken(response.data.access_token);
    }).catch((error) =>{
        console.error("caught error: ",error);
        throw error;
    });

};
const jwtPayload = (token) => {
    //const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET;
    console.log("token:",token);
    if(secret == null || secret==="")
        throw new Error("no secret given, cannot verify JWT");
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

    const existingFileCount =  await countExistingUserFiles(userBucket,userId);
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
const getUploadBucket = () =>{
    //const {Storage} = require('@google-cloud/storage');
    const uploadBucketName = process.env.UPLOAD_BUCKET  || "ergatas-public";
    const storage = new Storage();
    return storage.bucket(uploadBucketName);
}
const listUserFiles = async (userId) =>{

    const userBucket = getUploadBucket();
    var data= await userBucket.getFiles({
        autoPaginate: false,
        delimiter: '/',
        prefix: userId+'/'
    });
    var files = data[0];
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
const countExistingUserFiles = async (bucket,userId) =>{
    var data = await bucket.getFiles({
        autoPaginate: false,
        delimiter: '/',
        prefix: userId+'/'
      });
    var files = data[0];
    console.log("found "+files.length+" existing files for user id"+userId);
    return files.length;

};
const nonProfitSearch = async (query) =>{

    return axios.get("https://projects.propublica.org/nonprofits/api/v2/search.json?ntee[id]=8&c_code[id]=3&q="+query).
        then(function(response){
            return response.data;
        }).catch( (error) =>{
            console.log("query failed");
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
        text: "User "+user_key+"has submitted a  new organization for approval.</p> "+
                baseUrl+"organization-review/"+organization_key,
    };
    getMailgun().messages().send(data,(error,body) =>{
        if(error != null){
            console.error("org application notification email failed: ",error);
            console.log("body of error response: ",body);

        }else{
            console.log("org application notification email sent!",body);
        }
    });

};
const recordLog = (indexName,logs) =>{
    const esURL = process.env.ELASTIC_SEARCH_URL;

    if(esURL == null)
        throw new Error("no ES url given");

   // console.log(JSON.stringify(logs,null,4));

    var data = logs.map(log =>{
        return "{\"create\":{}}\n"+JSON.stringify(log)+"\n";
    }).join("");

    return axios.post(esURL+"/"+indexName+"/_bulk/",data,
        {
            headers: {
                "Content-Type":"application/x-ndjson",
            }
        }).then((response)=>{
            if(response.error != null && response.error.reason != null){
                throw new Error("Failed to record batch of log messages: "+response.error.reason);
            }
        }).catch((error) =>{
            console.error("Failed to record batch of log messages: ",error);
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
            throw new Error("request to verify recaptcha token failed. no data returned");
        if(response.data.success === false)
            throw new Error("request to verify recaptcha token failed. success was false");
        if(response.data.action != null && response.data.action !== action)
            throw new Error("request to verify recaptcha token failed. returned action did not match given action: "+
                                response.data.action+" != "+action);
        return response.data.score;
    });
    
}

const userIdToEmail = async (userId) =>{

    return fusionRequest("GET","/api/user/"+userId).
        then((response)=>{
            console.log("user information response: ",response.data,response.data.user.memberships);
            return response.data.user.email;
        });
}
const emailToHash=function(emailAddress){
    return "user_"+crypto.createHash("md5").update(emailAddress).digest("hex")+"@ergatas.org";
}
const saveEmailMapping =  function(emailAddress,hash){
    console.log("saving map from "+emailAddress+" to "+hash);

    return dbRequest("post","/email_hashes_view?on_conflict=email_address",{
        email_address:emailAddress,
        hashed_email_address:hash
    },{
        'Prefer': "resolution=ignore-duplicates",
    });

}
function hashToEmail(hashedEmail){
    console.log("fetching real email for hash "+hashedEmail);
    //TODO: catch not found error here
    return dbRequest("get","/email_hashes_view?hashed_email_address=eq."+hashedEmail,null,
                {
                    'Accept': "application/vnd.pgrst.object+json",
                }).
                then((response) =>{
                    if(response.data != null && response.data.email_address != null)
                        return response.data.email_address;
                    console.error("true email not found for hashed email "+hashedEmail);
                    return null;
                });

}
const contact = async (fromEmail, name, message,toEmail) =>{


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
        from: fromHash,
        to: toEmail,
        subject: name+" sent you a message on Ergatas",
        text: message
    };
    console.log("first contact mailgun data: ",data);
    getMailgun().messages().send(data,(error,body) =>{
        if(error != null){
            console.error("failed to send message from user to missionary",error);
            console.log("body of error response: ",body);
            throw new Error("failed to send message");
        }else{
            console.log("message email sent!",body);
        }
    });
}

const forwardMessage = async (email) =>{
    console.log("fowarding message: ",email);
    // lookup hashed 'to' address in database to get true email address
    // also rewrite 'from' to be hashed
    const realToEmail = await hashToEmail(email.recipient);
    const hashedFrom = emailToHash(email.sender);
    const data = {
        from: hashedFrom,
        to: realToEmail,
        subject: email.subject,
        text: email['body-plain'],
        html: email['body-html'],
    };
    console.log("foward mailgun data: ",data);
    getMailgun().messages().send(data,(error,body) =>{
        if(error != null){
            console.error("failed to send message from user to missionary",error);
            console.log("body of error response: ",body);
            throw new Error("failed to send message");
        }else{
            console.log("message email sent!",body);
        }
    });
}
const deleteUser = (userId) =>{

    return fusionRequest("DELETE","/api/user/"+userId+"?hardDelete=true").
        catch((error)=>{
            throw new Error("failed to delete user id "+userId,error);
        });

}
export {
  getJWT, 
  getSignedUploadUrl, 
  nonProfitSearch,
  jwtPayload,
  notifyOrgApplication,
  removeFile,
  listUserFiles,
  recordLog,
  validateRecaptcha,
  userIdToEmail,
  contact,
  forwardMessage,
  deleteUser,
  loginDataFromToken,
};
