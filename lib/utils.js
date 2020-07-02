const axios = require('axios');



// Generic GET request function
const getJWT = async (code) => {
    const jwt = require('jsonwebtoken');

    const authTokenUrl= process.env.AUTH_TOKEN_URL_BASE;
    const redirectUrl = process.env.REDIRECT_URL || "localhost";
    const authClientId= process.env.AUTH_CLIENT_ID;

    //return axios.post("http://fusionauth:9011/oauth2/token",
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
        var secret;
        console.log("got response: ",data);

        secret = process.env.JWT_SECRET;

        if(secret != null){
            payload= jwt.verify(data.access_token,secret);
            console.log("email: ",payload.email);
            data.email = payload.email;

        }else{
            //return failure somehow

            console.error("no secret found, cannot verify token");
        }


        return data;
    }).catch((error) =>{
        console.error("caught error: ",error);
    });

};


const getSignedUploadUrl = async (filename) =>{

    const {Storage} = require('@google-cloud/storage');
    const uploadBucketName = process.env.UPLOAD_BUCKET  || "ergatas-public";
    const storage = new Storage();
    const myBucket = storage.bucket(uploadBucketName);

    var file = myBucket.file(filename);

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
            console.log("signed url data:", data);
            return data[0];

        } ); 

};
const nonProfitSearch = async (query) =>{

    return axios.get("https://projects.propublica.org/nonprofits/api/v2/search.json?ntee[id]=8&c_code[id]=3&q="+query).
        then(function(response){
            return response.data;
        }).catch( (error) =>{
            console.log("query failed");
        });

};

module.exports = {
  getJWT: (code) => getJWT(code),
  getSignedUploadUrl: (filename) => getSignedUploadUrl(filename),
  nonProfitSearch: (query) => nonProfitSearch(query),
};
