

import Logger from './lib/shared/logging.js'; 
import dotenv from 'dotenv';
import path from 'path';
import express from 'express';
import serveStatic from 'serve-static';
import compression from 'compression';
import  cookieParser from 'cookie-parser';
import * as utils from './lib/server/utils.js';
import * as stripeUtils from './lib/server/stripe_utils.js';
import { AppError } from './lib/server/app-error.js';
import helmet from 'helmet';
import cron from 'node-cron';
import {ensureFields} from './lib/shared/shared-utils.js';
import fs from 'fs';
import sitemapXml from 'express-sitemap-xml';
import { Feeds } from './lib/server/feeds.js';
import { JoshuaProject} from './lib/server/joshua-project.js';
import Busboy from 'busboy';

dotenv.config(); // read .env files



//setup console logger
const logger = new Logger((buffer) => {
    return utils.recordLokiLog("web_logs",buffer);
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


//run once just to generate keys:
//import webPush  from 'web-push';
//console.local("webpush keys: \n",webPush.generateVAPIDKeys());

const app = express();
const port = process.env.PORT || 8080;
const cookieKey=process.env.COOKIE_KEY;
const jpApiKey = process.env.JOSHUA_PROJECT_API_KEY;
const jpBase= process.env.JOSHUA_PROJECT_API_ROOT;
const __dirname = path.resolve();
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal'])

const feeds = new Feeds();
//do this 10 sec after we start to make sure the db has started first
setTimeout( () =>{
   utils.randomMissionary().then( profile =>{
      feeds.addRandomMissionary(profile)
   });

   utils.updateJPWorkerCache(joshuaProject);

},10000)

const joshuaProject = new JoshuaProject(jpApiKey, jpBase);

utils.init();

var page_info_content=    fs.readFileSync(`${__dirname}/lib/data/page_info.json`)
const pageInfo = JSON.parse(page_info_content );
const pages = Object.keys(pageInfo);
//console.local("pages: ",pages);

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
  console.info("CRON: checking for profile updates");
  if(process.env.NODE_ENV === "development")
    console.log("Not running CRON job in development mode");
  else
    utils.checkProfileUpdates();
});
cron.schedule("0 0 * * *", () =>{
  console.info("CRON: refreshing joshua project data");

  joshuaProject.refresh()
    .catch( error => {
      console.error("failed to refresh joshua project data: "+error.message,error);
    });
   utils.updateJPWorkerCache(joshuaProject);

});

// runs at midnight, monday morning
cron.schedule("0 2 * * 1", async () =>{
  console.info("CRON: refreshing feeds");
  try{
    feeds.addRandomMissionary(await utils.randomMissionary());
  }catch(error){
    console.error("failed to set random missionary",error);
  }
  feeds.trim();
});

// runs at midnight, monday morning, after refreshing feeds
cron.schedule("0 12 * * 1", async () =>{
  try{
    if(process.env.NODE_ENV !== "development"){
      console.info("CRON: Sending out MOD notifications and emails");
      utils.sendMODNotifications(feeds);
      utils.sendMODEmails(feeds);
    }else
      console.info("CRON: NOT Sending out MOD notifications and emails, not in production mode");
  }catch(error){
    console.error("failed to send MOD notification",error);
  }
});

// run on first day of each month
cron.schedule("0 0 1 * *", async () =>{
  try{
    if(process.env.NODE_ENV !== "development"){
      await utils.pickPrayerCardDrawingWinner();
    }
  }catch(error){
    console.error("failed to send MOD notification",error);
  }
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


app.use((req, res, next) => {
  if (req.originalUrl === '/api/stripe') {
    next(); // Do nothing with the body because stripe needs it in a raw state.
  } else {
    express.json({limit: '50mb'})(req, res, next);  // ONLY do express.json() if the received request is NOT a WebHook from Stripe.
  }
});


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
function createGetEndpoint(url,f){
    app.get(url,async(req,res)=>{
        try{
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
    
    //console.logReq(req,"listing files for user "+userId);
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
createGetEndpoint("/api/peopleGroupWorkers/:peopleID3", async (req,res) =>{
   const domain = process.env.DOMAIN;
   var peopleID3 = req.params.peopleID3;
   var hasWorker = await joshuaProject.peopleGroupHasWorker(peopleID3);
   //console.log("People group "+peopleID3+" has worker? "+hasWorker);
   if(hasWorker)
      res.send(`https://${domain}/search/peopleGroupID/${peopleID3}\n`);
   else
      res.send("");
});
createGetEndpoint("/api/countryWorkers/:countryCode", async (req,res) =>{
   const domain = process.env.DOMAIN;
   var countryCode= req.params.countryCode
   var hasWorker = await joshuaProject.countryHasWorker(countryCode);
   //console.log("country "+countryCode+" has worker? "+hasWorker);
   if(hasWorker)
      res.send(`https://${domain}/search/countryCode/${countryCode}\n`);
   else
      res.send("");
});

app.post("/api/peopleGroupSearch",async(req,res)=>{
  try{
    //console.logReq(req,"in peopleGroupSearch endpoint",req.body);
    var query= req.body.query;
    var limit= req.body.limit;
    var data=await joshuaProject.peopleGroupSearch(query,limit);
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
    var data=await joshuaProject.peopleGroupNames(codes);
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
    var data=await joshuaProject.languageSearch(query,limit);
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
    var data=await joshuaProject.languageNames(codes);
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
      utils.recordLokiLog("web_logs",
        logs.map(log => {
          log.remoteIP = req.ip;
          log.source = "client";
          return log;
        }) );
    }
    else
      console.warnReq(req,"refusing to log data from invalid origin ");

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


//FOR DEV ONLY
//createJsonEndpoint("/api/fixBlobMimeTypes",async (req,res)=>{
//  await utils.fixBlobMimeTypes();
//  res.send();
//});

createJsonEndpoint("/api/markTxPaid",async (req,res)=>{
  utils.requireRole(req,"organization_review");
  await stripeUtils.markTxPaid(req.body.possible_transaction_key);
  res.send({});
});
createJsonEndpoint("/api/queuedMessages", async (req,res) =>{
   //console.local("fetching queued messages");
   utils.requireRole(req,"organization_review");
   res.send(await utils.getAllQueuedMessages());
});
createJsonEndpoint("/api/deleteQueuedMessage", async (req,res) =>{
   utils.requireRole(req,"organization_review");
   //console.local("deleting message ",req.body);
   ensureFields(req.body,["message_queue_key"]);
   await utils.deleteQueuedMessage(req.body.message_queue_key);
   res.send({});
});
createJsonEndpoint("/api/sendQueuedMessage", async (req,res) =>{
   utils.requireRole(req,"organization_review");
   ensureFields(req.body,["message_queue_key"]);
   const messageQueueKey = req.body.message_queue_key;
   //console.local("sending message ",messageQueueKey);
   await utils.sendQueuedMessage(messageQueueKey);
   await utils.deleteQueuedMessage(messageQueueKey);
   res.send({});
});

createJsonEndpoint("/api/allCurrencies", async (req,res) =>{
    res.send(await stripeUtils.allCurrencies());
});

createJsonEndpoint("/api/makeDonation",async (req,res)=>{
  ensureFields(req.body,["email","worker_name","amount","donation_type","missionary_profile_key"]);

  const url = await stripeUtils.makeDonation(req.body);
  res.send({payment_url:url});
});

createJsonEndpoint("/api/mailgun",async (req,res)=>{
  console.local("mailgun request: ",req.body);
  if(utils.verifyMailgunRequest(req.body.signature)){
    await utils.handleMailgunEvent(req.body["event-data"]);
    res.send();
  }
});

app.post('/api/stripe', express.raw({type: 'application/json'}), async (req, res) => {
 
  try{
    const sig = req.headers['stripe-signature'];

    await stripeUtils.handleStripeEvent(req.body,sig)
    res.send();
  }catch(err){
    console.error("error in stripe webhook: ",err);
    res.status(400).send(err);
  }
});

app.post("/api/contact/setup",async(req,res)=>{

  try{
    if(utils.validOrigin(req)){
      const data = req.body;
      utils.queueMessage(data.profileUserId,data.fromEmail,data.name, data.message);
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
	 const contentType = req.get('Content-Type');
    var data = {};
    var finishFn = async ()=>{
       console.info("contact/forward data: ",data);
       await utils.forwardMessage(data);

       res.setHeader("Content-Type","application/json");
       res.send({});
    }
    console.info("contact/forward content type: "+contentType);


	 if(contentType.startsWith("multipart/form-data")){
       console.info("processing multipart message");
       var busboy = new Busboy({headers: req.headers});
       busboy.on('field', function(fieldname, val ) {
          data[fieldname] = val;
       });
       busboy.on('finish',finishFn );
       req.pipe(busboy);
    }else{
       console.info("processing "+contentType+" message");
       data=req.body;
       finishFn();
    }

  }catch(error){
    errorHandler(error,req,res)
  }
});

/*
app.post("/api/contact/forward-multipart", multipartMiddleware, async(req,res)=>{

  try{
     //console.info("contact/forward content type: "+req.get('Content-Type'));
     //console.local("body: ",req.body);
    const data = req.body;
    //console.info("contact/forward req.body: "+JSON.stringify(data));

    utils.cleanupFiles(req.files);

    await utils.forwardMessage(data);

    res.setHeader("Content-Type","application/json");
    res.send({});
  }catch(error){
    errorHandler(error,req,res)
  }
});
*/


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
//createJsonEndpoint("/api/vapidPublicKey", async (req,res) =>{
	//res.send({key:process.env.VAPID_PUBLIC_KEY});
//});

createJsonEndpoint("/api/registerPushSubscriber", async (req,res) =>{
	console.log("registering push subscriber",req.body);
	var subscription =req.body.subscription;
   var lists = req.body.lists;
   if(subscription){
      utils.sendNotification(subscription,{
         title:"Ergatas Notice",
         body: "Yay, your Ergatas notifications are working!",
      });
      utils.savePushSubscription(subscription,lists);

      res.sendStatus(201);
   }else{
      console.error("registerPushSubscriber failed, not subscription sent");
      res.sendStatus(400);
   }

});
createJsonEndpoint("/api/unsubscribePushNotifications", async (req,res) =>{
   var subscription = req.body.subscription;
   utils.unsubscribePushNotifications(subscription);
   res.sendStatus(200);
});
createJsonEndpoint("/api/sendNotification", async (req,res) =>{
   var push_subscription_key = req.body.push_subscription_key;

   utils.sendMODNotification(push_subscription_key,feeds);
	
	res.sendStatus(200);
});

createJsonEndpoint("/api/profileStats", async (req,res) =>{
  res.send(await utils.getProfileStats(req.body.missionary_profile_key));
});


createJsonEndpoint("/api/peopleGroupIds",async(req,res) =>{
  const setName = req.body.setName;
  res.send(await joshuaProject.peopleGroupIds(setName));
});

// Deprecated
createJsonEndpoint("/api/frontierPeopleGroupIds",async(req,res) =>{
  res.send(await joshuaProject.peopleGroupIds("Frontier"));
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
    //console.local("payload: ", payload);

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
createJsonEndpoint("/api/sendDonationConfirmationEmails", async(req,res)=>{
   var monthsPrev = req.body.monthsPrev;
   var test = req.body.test;
   await utils.emailUsersWithDonationClicks(monthsPrev,test);
   res.sendStatus(200);

});
app.post("/api/newsletterSignup",  async(req,res)=>{
  console.log("start of newsletterSignup");
  try{
    const firstName = req.body.firstName;
    const lastName = req.body.lastName;
    const email = req.body.email;
    const addToPrayerList = req.body.prayer || false;
    const dailyPrayer = req.body.dailyPrayer || false;
    const mobilizer = req.body.mobilizer || false;
    const recaptchaScore = req.body.recaptchaScore;

    await utils.newsletterSignup(firstName,lastName,email, addToPrayerList,recaptchaScore,dailyPrayer, mobilizer);
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
  //console.local("serving page: "+page);
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

