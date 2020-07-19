const axios = require('axios');
const Mailgun = require('mailgun-js');


// Generic GET request function
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
        var data=response.data;
        var payload;
        //console.log("got response: ",data);

        payload = jwtPayload(data.access_token);
        data.email = payload.email;
        data.userKey = payload.sub;


        return data;
    }).catch((error) =>{
        console.error("caught error: ",error);
        throw error;
    });

};
const jwtPayload = (token) => {
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET;
    console.log("token:",token);
    if(secret == null || secret==="")
        throw new AppError("no secret given, cannot verify JWT");
    return jwt.verify(token,secret);
}
const getUserKey = (token) =>{
    var payload = jwtPayload(token);
    return payload.sub;
 
}


const getSignedUploadUrl = async (userKey,filename) =>{

    const maxFilesPerUser = process.env.MAX_USER_FILES ;
    const userBucket = getUploadBucket();
    var file = userBucket.file(userKey+"/"+filename);

    const existingFileCount =  await countExistingUserFiles(userBucket,userKey);
    if(existingFileCount + 1 > maxFilesPerUser){
        console.warn("for user "+userKey+", found "+existingFileCount+
            " files, current upload would exceed max file count of "+maxFilesPerUser);
        return null;
    }

    //-
    // Generate a URL that allows temporary access to download your file.
    //-
    var request = require('request');
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
const removeFile = (userKey,filename) =>{

    return getUploadBucket().file(userKey+"/"+filename).delete();
}
const getUploadBucket = () =>{
    const {Storage} = require('@google-cloud/storage');
    const uploadBucketName = process.env.UPLOAD_BUCKET  || "ergatas-public";
    const storage = new Storage();
    return storage.bucket(uploadBucketName);
}
const listUserFiles = async (userKey) =>{

    const userBucket = getUploadBucket();
    var data= await userBucket.getFiles({
        autoPaginate: false,
        delimiter: '/',
        prefix: userKey+'/'
    });
    var files = data[0];
    var filenames = files.map(file => 
        {
            return {
                name: file.metadata.name.replace(userKey+'/',"" ),
                link: file.metadata.mediaLink,
            };
        });
    console.log("filenames: ",filenames);
    return filenames;
}
const countExistingUserFiles = async (bucket,userKey) =>{
    var data = await bucket.getFiles({
        autoPaginate: false,
        delimiter: '/',
        prefix: userKey+'/'
      });
    var files = data[0];
    console.log("found "+files.length+" existing files for user key "+userKey);
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
const notifyOrgApplication = async (profile_key) => {
    const api_key = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;
    const orgNotifyEmail = process.env.ORG_APP_NOTIFY_EMAIL;
    const baseUrl = process.env.REDIRECT_URL;

    if(api_key == null || api_key === '')
        throw new Error("no api_key defined for Mailgun");
    if(domain == null || domain === '')
        throw new Error("no domain defined for Mailgun");

    const mailgun = Mailgun({apiKey: api_key, domain: domain});
    const data = {
        from: "information@ergatas.org",
        to: orgNotifyEmail,
        subject: "New Organization Application",
        text: "A new organization has been submitted for approval.</p> "+
                baseUrl+"profileReview/"+profile_key,
    };
    mailgun.messages().send(data,(error,body) =>{
        if(error != null){
            console.error("org application notification email failed: ",error);
            console.log("body of error response: ",body);

        }else{
            console.log("org application notification email sent!",body);
        }
    });

};

module.exports = {
  getJWT, 
  getSignedUploadUrl, 
  nonProfitSearch,
  jwtPayload,
  notifyOrgApplication,
  removeFile,
  listUserFiles,
};
