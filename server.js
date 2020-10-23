

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
import {ensureFields} from './lib/client-utils.js';
import fs from 'fs';

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

//run daily
cron.schedule("0 0 * * *",() =>{
  console.info("CRON: checking for profile updates");
  utils.checkProfileUpdates();
});

app.use(helmet({
  contentSecurityPolicy: false,
  dnsPrefetchControl: false,
  

}));
app.use(cookieParser(cookieKey));
app.use(compression());

// Set dist and  public folder as roots, with priority for dist
//app.use(express.static('dist'));
//app.use(express.static('public'));


app.use(serveStatic(path.join(__dirname, 'dist'), {
  maxAge: '1h',
  setHeaders: utils.setCustomCacheControl
}));

app.use(serveStatic(path.join(__dirname, 'public'), {
  maxAge: '1d',
  setHeaders: utils.setCustomCacheControl
}));


// Allow front-end access to node_modules folder
//app.use('/scripts', express.static(`${__dirname}/node_modules/`));

app.use(express.json());
app.use(express.urlencoded({extended:true}));



app.post("/api/getSignedUrl",async(req,res)=>{
  try{
    var filename = req.body.filename;
    var userId= utils.jwtPayload(req.body.token).sub;
    console.logReq(req,"getting upload url for filename ",userId,filename);
    var url = await utils.getSignedUploadUrl(userId,filename);
    res.setHeader("Content-Type","application/json");

    if(url === null){
      res.send({error: "Max file count exceeded"});
    }else
      res.send({url:url});
  }catch(error){
    errorHandler(error,req,res)
  }

});
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
app.post("/api/orgAppNotify",async(req,res)=>{

  try{
    const user_key= req.body.user_key;
    const organization_key = req.body.organization_key;
    if(user_key == null)
      throw AppError("no user_key given for orgAppNotify");
    if(organization_key== null)
      throw AppError("no organization_key given for orgAppNotify");

    utils.notifyOrgApplication(user_key, organization_key);
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


app.post("/api/deleteUser",  async(req,res)=>{

  try{
    const userId= utils.jwtPayload(req.body.token).sub;
    await utils.removeAllFiles(userId);
    await utils.deleteUser(userId);
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
app.post("/api/newsletterSignup",  async(req,res)=>{
  console.log("start of newsletterSignup");
  try{
    const firstName = req.body.firstName;
    const lastName = req.body.lastName;
    const email = req.body.email;
    const addToPrayerList = req.body.prayer || false;

    

    await utils.newsletterSignup(firstName,lastName,email, addToPrayerList);
    res.setHeader("Content-Type","application/json");
    res.send({});
  }catch(error){
    errorHandler(error,req,res)
  }
});

app.post("/api/notifyOrgUpdate",  async(req,res)=>{
  console.log("sending notifications to org listeners");
  try{
    ensureFields(req.body,["organization_key"]);
    var token = req.body.token;
    const organization_key= req.body.organization_key;
    
    //const data = utils.loginDataFromToken(tokenFromCookie);
    //if(data != null && data.roles != null && data.roles.contains("ergatas_org_admin"))
    await utils.notifyOrgUpdate(token,organization_key);
    //else
      //throw new AppError("Not authorized");

    res.setHeader("Content-Type","application/json");
    res.send({});
  }catch(error){
    errorHandler(error,req,res)
  }
});



const templatePages = pages.map((p)=> new RegExp("/("+p+")"));
templatePages.push(/\//);
//console.local("page patterns: ",templatePages);
app.get(templatePages,(req, res) =>{
//app.use("/",(req, res,next) =>{
  //console.log(" ==== building index page ==== ");
  //console.local("params: ",req.params);
  //console.local("query params: ",req.query);
  var page= req.params[0] ;
  //console.local("page: "+page);


  if( page == null || page === "" || page === "index" || page === "index.html" || page === "index.htm"){
    if(req.query.state)
      page =req.query.state;
    else
      page="home";
  }

  //console.log("serving page: "+page);
  try{
    const info = pageInfo[page];
    const finalPage = utils.buildIndex(page,info);
    //console.log("final page: \n",finalPage);
    res.send(finalPage);
  }catch(error){
    //errorHandler(error,req,res)
    console.warn("error building index page for "+page+", just sending back the unmodified index."+
                 " error message: "+error.message);
    res.sendFile(`${__dirname}/lib/page-templates/index.html`)
  }

  //next();
} );


// Redirect all traffic to index.html
//app.use((req, res) => res.sendFile(`${__dirname}/public/index.html`));

// Listen for HTTP requests on port 8080
app.listen(port, () => {
  console.log('listening on %d', port);
});

