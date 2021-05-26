

//import { getJWT,jwtPayload, getSignedUploadUrl, nonProfitSearch,
       //notifyOrgApplication,removeFile,listUserFiles,recordLog,
       //validateRecaptcha } from './lib/utils.js';
import Logger from './lib/logging.js'; 
import dotenv from 'dotenv';
import path from 'path';
import express from 'express';
import serveStatic from 'serve-static';
import compression from 'compression';
import  cookieParser from 'cookie-parser';
import * as utils from './lib/utils.js';
import { AppError } from './lib/app-error.js';
import helmet from 'helmet';
import cron from 'node-cron';
import {ensureFields} from './lib/shared-utils.js';
import fs from 'fs';
import stripePkg from 'stripe';
import sitemapXml from 'express-sitemap-xml';
import { Feeds } from './lib/server/feeds.js';

dotenv.config(); // read .env files

//setup console logger
const logger = new Logger((buffer) => {
    return utils.recordLog("web_logs",buffer);
});
console.logWithRequest= function(level,req,message,...args){
  console.local(level,message,args);
  logger.log(level,message,{
    additionalInformation: args,
    remoteIP: req.ip,
    protocol: req.protocol,
    url: req.originalUrl,
    source: "server",
    headers: req.headers,
  });
};
console.logReq = (req,message,...args)=> console.logWithRequest("log",req,message,...args);
console.warnReq = (req,message,...args)=> console.logWithRequest("warn",req,message,...args);
console.errorReq = (req,message,...args)=> console.logWithRequest("error",req,message,...args);

const app = express();
const port = process.env.PORT || 8080;
const cookieKey=process.env.COOKIE_KEY;
const __dirname = path.resolve();
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal'])

const feeds = new Feeds();
utils.randomMissionary().then( profile => feeds.addRandomMissionary(profile));

utils.init();

var page_info_content=    fs.readFileSync(`${__dirname}/lib/data/page_info.json`)
const pageInfo = JSON.parse(page_info_content );
const pages = Object.keys(pageInfo);
//console.local("pages: ",pages);

//cached people group data. this will be refreshed via  a cron job
var peopleGroupNames ;
var peopleGroupsPromise = utils.downloadPeopleGroups().then(data => {
  peopleGroupNames = data;
  return peopleGroupNames;
})

//cached language data. this will be refreshed via  a cron job
var languageNames ;
var languagePromise = utils.downloadLanguages().then(data => {
  languageNames = data;
  return languageNames;
})



if(!cookieKey)
  console.error("No COOKIE_KEY set");
 
const errorHandler = (err, req, res) => {
  
  if(err.name === "TokenExpiredError"){
    //JWT token provided has expired
    console.errorReq(req, 'Provided JWT token has expired', err);
    res.status(401).send({ title: 'JWT token expired', message: err.message });
  }else if (err.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    console.errorReq(req, 'Server responded with an error', err);
    res.status(403).send({ title: 'Server responded with an error', message: err.message });
  } else if (err.request) {
    // The request was made but no response was received
    console.errorReq(req, 'Unable to communicate with server', err);
    res.status(503).send({ title: 'Unable to communicate with server', message: err.message });
  } else {
    // Something happened in setting up the request that triggered an Error
    console.errorReq(req, 'An unexpected error occurred', err);
    res.status(500).send({ title: 'An unexpected error occurred', message: err.message });
  }
};

console.local("node env: "+process.env.NODE_ENV);
//run daily
cron.schedule("0 0 * * *",() =>{
  console.warn("CRON: checking for profile updates");
  if(process.env.NODE_ENV === "development")
    console.warn("Not running CRON job in development mode");
  else
    utils.checkProfileUpdates();
});

cron.schedule("0 0 * * *", () =>{
  console.info("CRON: refreshing people group data");

  peopleGroupsPromise = utils.downloadPeopleGroups().then(data => {
    peopleGroupNames = data;
    return peopleGroupNames;
  }).catch( error => {
    console.error("failed to refresh people group data: "+error.message,error);

  })
});
cron.schedule("0 1 * * *", () =>{
  console.info("CRON: refreshing languages data");
  languagePromise = utils.downloadLanguages().then(data => {
    languageNames = data;
    return languageNames;
  }).catch( error => {
    console.error("failed to refresh language data: "+error.message,error);
  })
});

cron.schedule("0 2 * * *", async () =>{
  console.info("CRON: refreshing feeds");
  try{
    feeds.addRandomMissionary(await utils.randomMissionary());
  }catch(error){
    console.error("failed to set random missionary",error);
  }
  feeds.trim();
});


app.use(helmet({
  contentSecurityPolicy: false,
  dnsPrefetchControl: false,
  

}));
app.use(cookieParser(cookieKey));
app.use(compression());

// Set dist and  public folder as roots, with priority for dist
app.use(serveStatic(path.join(__dirname, 'dist'), {
  maxAge: '1h',
  setHeaders: utils.setCustomCacheControl
}));

app.use(serveStatic(path.join(__dirname, 'public'), {
  maxAge: '1d',
  setHeaders: utils.setCustomCacheControl
}));

app.use(sitemapXml(utils.sitemapUrlsFn(pageInfo),"https://ergatas.org"));


app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({extended:true,limit: "5mb"}));

function createJsonEndpoint(url,f){
  createEndpoint(url,"application/json",f);
}
function createEndpoint(url,contentType,f){
    app.post(url,async(req,res)=>{
        try{
            res.setHeader("Content-Type",contentType);
            await f(req,res);
        }catch (error){
            errorHandler(error,req,res)
        }
    });
}


app.post("/api/removeUserFile",async(req,res)=>{
  try{
    var filename = req.body.filename;
    var userId= utils.jwtPayload(req.body.token).sub;
    console.logReq(req,"removing file "+filename);
    await utils.removeFile(userId,filename);
    res.setHeader("Content-Type","application/json");
    res.send({});
  }catch(error){
    errorHandler(error,req,res)
  }
});
app.post("/api/listUserFiles",async(req,res)=>{
  try{
    var userId;
    if(req.body.userId != null)
      userId = req.body.userId;
    else if(req.body.token != null)
      userId= utils.jwtPayload(req.body.token).sub;
    else  
      throw new AppError("no userId given");
    
    console.logReq(req,"listing files for user "+userId);
    var files = await utils.userFileLinks(userId);
    res.setHeader("Content-Type","application/json");
    res.send(files);
  }catch(error){
    errorHandler(error,req,res)
  }
});


app.post("/api/token",async(req,res)=>{
  try{
    //console.logReq(req,"in token endpoint",req.params);

    res.setHeader("Content-Type","application/json");
    if(utils.validOrigin(req)){
      var jwtData =await utils.getJWT(req.body.code);
      var data = jwtData.clientData;
      var refresh_token = jwtData.refresh_token;

      res.setHeader("Content-Type","application/json");
      if(data != null){
        res.cookie("esession",refresh_token,{expires: 0,signed:true,httpOnly:true,secure:true,sameSite:"Strict"});
        res.send(data);
      }
    }else
      console.warnReq(req,"Refusing to issue token due to invalid domain: "+req.headers.origin)
    //res.send({});

  }catch (error){
    errorHandler(error,req,res)
  }
});
app.post("/api/refresh",async (req,res) =>{
  try{

    var refresh_token= req.signedCookies.esession;
    if(refresh_token == null || refresh_token === "") {
      res.status(401).send({title: "not authorized",message:"no session cookie found, cannot refresh authorization"});
      return;
    }

    var clientData = await utils.refreshJWT(refresh_token);
    res.setHeader("Content-Type","application/json");
    res.send(clientData);
  }catch(error){
    //if we fail to refresh, assume the refresh_token has expired
    res.cookie("esession","deleted",{maxAge:-99999999,signed:true,httpOnly:true,secure:true,sameSite:"Strict"})
    errorHandler(error,req,res)
  }

});
app.post("/api/signOut",async(req,res)=>{
  console.info("signing out");
  res.cookie("esession","deleted",{maxAge:-99999999,signed:true,httpOnly:true,secure:true,sameSite:"Strict"})
  res.setHeader("Content-Type","application/json");
  res.send({});
});
app.post("/api/nonProfits",async(req,res)=>{
  try{
    console.logReq(req,"in nonProfits endpoint",req.body);
    var query= req.body.query;
    var state = req.body.state;
    var data=await utils.nonProfitSearch(query,state);
    //console.logReq(req,"data: ",data);

    res.setHeader("Content-Type","application/json");
    res.send(data);
  }catch (error){
    errorHandler(error,req,res)
  }
});
app.post("/api/peopleGroupSearch",async(req,res)=>{
  try{
    //console.logReq(req,"in peopleGroupSearch endpoint",req.body);
    var query= req.body.query;
    var limit= req.body.limit;
    var data=await utils.peopleGroupSearch(query,limit,peopleGroupsPromise);
    //console.logReq(req,"data: ",data);

    res.setHeader("Content-Type","application/json");
    res.send(data);
  }catch (error){
    errorHandler(error,req,res)
  }
});
app.post("/api/peopleGroupNames",async(req,res)=>{
  try{
    //console.logReq(req,"in peopleGroupNames endpoint",req.body);
    var codes= req.body.codes;
    var data=await utils.peopleGroupNames(codes,peopleGroupsPromise);
    //console.logReq(req,"data: ",data);

    res.setHeader("Content-Type","application/json");
    res.send(data);
  }catch (error){
    errorHandler(error,req,res)
  }
});
app.post("/api/languageSearch",async(req,res)=>{
  try{
    //console.logReq(req,"in languageSearch endpoint",req.body);
    var query= req.body.query;
    var limit= req.body.limit;
    var data=await utils.languageSearch(query,limit,languagePromise);
    //console.logReq(req,"data: ",data);

    res.setHeader("Content-Type","application/json");
    res.send(data);
  }catch (error){
    errorHandler(error,req,res)
  }
});
app.post("/api/languageNames",async(req,res)=>{
  try{
    //console.logReq(req,"in languageNames endpoint",req.body);
    var codes= req.body.codes;
    var data=await utils.languageNames(codes,languagePromise);
    //console.logReq(req,"data: ",data);

    res.setHeader("Content-Type","application/json");
    res.send(data);
  }catch (error){
    errorHandler(error,req,res)
  }
});



app.post("/api/orgAppNotify",async(req,res)=>{

  try{
    const user_key= req.body.user_key;
    const external_user_id= req.body.external_user_id;
    const organization_key = req.body.organization_key;
    if(user_key == null)
      throw AppError("no user_key given for orgAppNotify");
    if(organization_key== null)
      throw AppError("no organization_key given for orgAppNotify");

    utils.notifyOrgApplication(user_key, external_user_id, organization_key);
    res.setHeader("Content-Type","application/json");
    res.send({});
  }catch(error){
    errorHandler(error,req,res)
  }
});
app.post("/api/log",async(req,res)=>{

  try{
    const log_key = process.env.LOG_KEY;
    const given_log_key= req.body.key;
    const logs = req.body.logs;
    //const validOrigins = process.env.CLIENT_ORIGINS.split(";");
    //const origin = req.headers.origin;

    if(log_key !== given_log_key)
        throw new AppError("log_key is not correct");
    

    //if(validOrigins.indexOf(origin) !== -1){
    if(utils.validOrigin(req)){
      //inject ip address for each log
      utils.recordLog("web_logs",
        logs.map(log => {
          log.remoteIP = req.ip;
          log.source = "client";
          return log;
        }) );
    }
    else
      console.warnReq(req,"refusing to log data from invalid origin "+origin);

    res.setHeader("Content-Type","application/json");
    res.send({});
  }catch(error){
    errorHandler(error,req,res)
  }
});
app.post("/api/recaptcha",async(req,res)=>{

  try{
    const recaptchaToken = req.body.recaptchaToken;
    const action = req.body.action;
    const remoteIp = req.ip;

    ensureFields(req.body,["recaptchaToken","action"]);

    if(remoteIp == null || req.ip === "")
      console.warn("while validating recaptcha token, could not get remote ip address");

    const score =await  utils.validateRecaptcha(recaptchaToken,action,remoteIp);


    res.setHeader("Content-Type","application/json");
    res.send({score:score});
  }catch(error){
    errorHandler(error,req,res)
  }
});
app.post("/api/verifyUser",async(req,res)=>{
  try{
    const userId= utils.jwtPayload(req.body.token).sub;
    res.setHeader("Content-Type","application/json");
    res.send(await utils.isUserVerified(userId));
  }catch(error){
    errorHandler(error,req,res)
  }
});
app.post("/api/resendVerifyEmail",async(req,res)=>{
  try{
    const email = utils.jwtPayload(req.body.token).email;
    await utils.resendVerifyEmail(email);
    res.setHeader("Content-Type","application/json");
    res.send({});
  }catch(error){
    errorHandler(error,req,res)
  }
});

app.post("/api/contact/setup",async(req,res)=>{

  try{
    if(utils.validOrigin(req)){
      const data = req.body;

      const toEmail = await utils.userIdToEmail(data.profileUserId);
      console.log("email for user id "+data.profileUserId+": "+toEmail);
      const result =await  utils.contact(data.fromEmail,data.name,data.message,toEmail);
      console.log("contact result: ",result);
    }else
      throw new AppError("refusing to setup contact due to invalid origin");


    res.setHeader("Content-Type","application/json");
    res.send({});
  }catch(error){
    errorHandler(error,req,res)
  }
});
app.post("/api/contact/forward",  async(req,res)=>{

  try{
    const data = req.body;

    await utils.forwardMessage(data);

    res.setHeader("Content-Type","application/json");
    res.send({});
  }catch(error){
    errorHandler(error,req,res)
  }
});
app.post("/api/contact",  async(req,res)=>{

  try{
    const name=req.body.name;
    const email=req.body.fromEmail;
    const message=req.body.message;

    await utils.sendMessage(name,email,message);

    res.setHeader("Content-Type","application/json");
    res.send({});
  }catch(error){
    errorHandler(error,req,res)
  }
});
app.post("/api/contact/bulk",  async(req,res)=>{

  try{
    ensureFields(req.body,["token","emails","subject","message"]);
    const payload = utils.jwtPayload(req.body.token);
    const emails=req.body.emails;
    const subject =req.body.subject;
    const message=req.body.message;
    var result={};

    console.log("payload: ",payload);
    if(payload != null && payload.roles != null && payload.roles.includes("organization_review")){
      result = await utils.sendBulkMessage(emails,subject,message);

      /* for testing
      console.log("SENDING TEST MESSAGE TO test_list@app.ergatas.org");
      utils.sendEmail({
            from: "Ergatas <web@app.ergatas.org>",
            to: "test_list@app.ergatas.org",
            subject: "test list message from api2",
            "h:Reply-To":"Ergatas <web@app.ergatas.org>",
            html: "hi2"
        });
        */



    }else{
      throw new AppError("Not authorized");
    }

    res.setHeader("Content-Type","application/json");
    res.send(result);
  }catch(error){
    errorHandler(error,req,res)
  }
});



app.post("/api/deleteUser",  async(req,res)=>{

  try{
    const payload = utils.jwtPayload(req.body.token);
    const userId= payload.sub;
    const email = payload.email;
    await utils.removeAllFiles(userId);
    await utils.deleteUser(userId,email);
    res.setHeader("Content-Type","application/json");
    res.send({});
  }catch(error){
    errorHandler(error,req,res)
  }
});
app.get("/api/checkProfileUpdates",  async(req,res)=>{

  try{

    const stats = await utils.checkProfileUpdates();
    res.setHeader("Content-Type","application/json");
    res.send(stats);
  }catch(error){
    errorHandler(error,req,res)
  }
});
app.post("/api/newUser",  async(req,res)=>{
  try{
    const email = utils.jwtPayload(req.body.token).email;
    await utils.addUserToMailinglist(email);
    res.setHeader("Content-Type","application/json");
    res.send({});
  }catch(error){
    errorHandler(error,req,res)
  }

});
createJsonEndpoint("/api/newProfile", async(req,res)=>{
    const email = utils.jwtPayload(req.body.token).email;
    const firstName = req.body.firstName;
    const lastName = req.body.lastName;
    await utils.newProfile(email,firstName,lastName);
    res.send({});
});
createJsonEndpoint("/api/firstPublish", async(req,res)=>{
    const email = utils.jwtPayload(req.body.token).email;
    const missionary_profile_key= req.body.missionary_profile_key;
    const profile = await utils.getMissionaryProfile(missionary_profile_key);

    //console.local("first publish profile ",profile);
    if(profile != null && profile.data.limit_social_media !== true)
      feeds.addNewMissionary(profile);
    res.send({});
});
app.post("/api/getUserEmails",  async(req,res)=>{
  try{
    const payload = utils.jwtPayload(req.body.token);
    var emails;
    ensureFields(req.body,["userIds"]);
    console.local("payload: ", payload);

    if(payload != null && payload.roles != null && payload.roles.includes("organization_review")){
      emails = await utils.getUserEmails(req.body.userIds);
    }else{
      throw new AppError("Not authorized");
    }
    res.setHeader("Content-Type","application/json");
    res.send(emails);
  }catch(error){
    errorHandler(error,req,res)
  }

});
app.post("/api/newsletterSignup",  async(req,res)=>{
  console.log("start of newsletterSignup");
  try{
    const firstName = req.body.firstName;
    const lastName = req.body.lastName;
    const email = req.body.email;
    const addToPrayerList = req.body.prayer || false;
    const recaptchaScore = req.body.recaptchaScore;

    await utils.newsletterSignup(firstName,lastName,email, addToPrayerList,recaptchaScore);
    res.setHeader("Content-Type","application/json");
    res.send({});
  }catch(error){
    errorHandler(error,req,res)
  }
});

app.post("/api/notifyOrgUpdate",  async(req,res)=>{
  console.info("sending notifications to org listeners");
  try{
    ensureFields(req.body,["organization_key"]);
    var token = req.body.token;
    const organization_key= req.body.organization_key;
    const message = req.body.message;
    
    await utils.notifyOrgUpdate(token,organization_key,message);

    res.setHeader("Content-Type","application/json");
    res.send({});
  }catch(error){
    errorHandler(error,req,res)
  }
});

app.post('/api/donate', async (req, res ) => {

  try {
    ensureFields(req.body,["name","email","amount"]);

    const name = req.body.name;
    const email = req.body.email;
    const amount = req.body.amount;

    // Create a PI:
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const stripe = stripePkg(stripeKey);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // In cents
      currency: 'usd',
      receipt_email: email,
      description: "Donation to Ergatas"
    });
    console.info(`DONATION INITIATED: ${name}, ${email}, ${amount} , ${paymentIntent.id}`); 
    res.send({
      name: name, 
      amount: amount, 
      paymentIntentId: paymentIntent.id,
      intentSecret: paymentIntent.client_secret });
  } catch(error) {
    errorHandler(error,req,res)
  }
});

app.post('/api/donate/confirm', async (req, res ) => {

  try {
    ensureFields(req.body,["name","email","amount","paymentIntentId"]);

    const name = req.body.name;
    const email = req.body.email;
    const amount = req.body.amount;
    const paymentIntentId = req.body.paymentIntentId;

    // Create a PI:
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const stripe = stripePkg(stripeKey);

    const paymentIntent = await stripe.paymentIntents.update( paymentIntentId,
      {receipt_email:email}
    );
    console.local(paymentIntent);
    console.info(`DONATION CONFIRMED: ${name}, ${email}, ${amount} , ${paymentIntentId}`); 
    res.send({});
  } catch(error) {
    errorHandler(error,req,res)
  }
});

app.get("/feeds/missionaryOfTheDay",async(req,res)=>{
    try{
        res.setHeader("Content-Type","application/xml");
        res.send(feeds.xml("missionaryOfTheDay"));
    }catch (error){
        errorHandler(error,req,res)
    }
});
app.get("/feeds/newMissionaries",async(req,res)=>{
    try{
        res.setHeader("Content-Type","application/xml");
        res.send(feeds.xml("newMissionaries"));
    }catch (error){
        errorHandler(error,req,res)
    }
});



//const templatePages = pages.map((p)=> new RegExp("/("+p+")\\b"));
const templatePages = pages.map((p)=>{
  var pattern = (pageInfo[p] && pageInfo[p].pattern) || p;
  var path = (pageInfo[p] && pageInfo[p].path) || "";
  return new RegExp("^/"+path+"("+pattern+")\\b") 
});
templatePages.push(/\/()$/);
//console.local("page patterns: ",templatePages);
app.get(templatePages, async (req, res) =>{
  //console.local(" ==== building index page ==== ");
  //console.local("params: ",req.params);
  //console.local("url: ",req.url);
  var page= req.params[0] ;
  //console.local("page: "+page);


  if( page == null || page === "" || page === "index" || page === "index.html" || page === "index.htm"){
    if(req.query.state)
      page =req.query.state;
    else{
        page="home";

    }
  } 
  console.local("serving page: "+page);
  try{
    const info = pageInfo[page];
    res.send(await utils.buildIndex(page,info,req.url));
  }catch(error){
    console.warn("error building index page for "+page+", just sending back the unmodified index."+
                 " error message: "+error.message);
    res.sendFile(`${__dirname}/lib/page-templates/index.html`)
  }

} );

app.get('*', async (req, res) =>{
  try{
    var page = "not-found";
    var info = pageInfo[page];
    res.status(404);
    res.send(await utils.buildIndex(page,info));

  }catch(error){
    console.error("failed to build not-found page: "+error.message);
    res.sendFile(`${__dirname}/lib/page-templates/index.html`)
  }
});

// Listen for HTTP requests on port 8080
app.listen(port, () => {
  console.log('listening on %d', port);
});

