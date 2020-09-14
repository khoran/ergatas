

//import { getJWT,jwtPayload, getSignedUploadUrl, nonProfitSearch,
       //notifyOrgApplication,removeFile,listUserFiles,recordLog,
       //validateRecaptcha } from './lib/utils.js';
import Logger from './lib/logging.js'; 
import dotenv from 'dotenv';
import path from 'path';
import express from 'express';
import compression from 'compression';
import  cookieParser from 'cookie-parser';
import * as utils from './lib/utils.js';
import { AppError } from './lib/app-error.js';

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
const __dirname = path.resolve();
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal'])


/*
app.use( (req, res, next) => {
    var startAt = process.hrtime();

    res.on("finish",() =>{
      const diff = process.hrtime(startAt);
      const time = diff[0] * 1e3 + diff[1] * 1e-6;
      console.log("finished "+req.originalUrl);
      console.log("res._headers >>>>>>>" + JSON.stringify(res._headers));
      console.log("size : ", res.getHeader('Content-Length') || res._contentLength);
      console.local("real ip : ",res.getHeader("x-real-ip"));
      logger.log("info","request",{
          remoteIP: req.ip,
          protocol: req.protocol,
          url: req.originalUrl,
          status: res.statusCode,
          size: parseInt(res.get("Content-Length")),
          duration:time,
        });
    });

    next();
  });
  */
  
const errorHandler = (err, req, res) => {
  if (err.response) {
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


// add & configure middleware
//app.use(session({
//  //genid: (req) => {
//  //  console.log('Inside the session middleware')
//  //  console.log(req.sessionID)
//  //  return uuid() // use UUIDs for session IDs
//  //},
//  store: new FileStore(),
//  secret: 'replacemewithENVpassword',
//  resave: false,
//  saveUninitialized: true
//}))

//const upload = multer();

app.use(cookieParser("ljeij4n39bn2KJSHF33lgj$"));
app.use(compression());

// Set public folder as root
app.use(express.static('public'));
app.use(express.static('dist'));

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
      userId = utils.jwtPayload(req.body.token).sub;
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
    //console.log("given cookies: ",req.cookies);
    var tokenFromCookie = req.cookies.esession;
    var data;
    var code = req.body.code;
    //console.log("token from cookie: "+tokenFromCookie);

    if(tokenFromCookie != null && tokenFromCookie !== "deleted"){
      console.info("using token from cookie"); 
      data = utils.loginDataFromToken(tokenFromCookie);
    }else if(code != null){
      data=await utils.getJWT(req.body.code);
    }
    console.logReq(req,"data: ",data);

    res.setHeader("Content-Type","application/json");
    if(data != null){
      res.cookie("esession",data.access_token,{expires: new Date(data.expires*1000),httpOnly:true,secure:true,sameSite:"Strict"});
      res.send(data);
    }else{
      res.send({});
    }

  }catch (error){
    errorHandler(error,req,res)
  }
});
app.post("/api/signOut",async(req,res)=>{
  console.info("signing out");
  res.cookie("esession","deleted",{maxAge:-99999999,httpOnly:true,secure:true,sameSite:"Strict"})
  res.setHeader("Content-Type","application/json");
  res.send({});
});
app.get("/api/nonProfits/:query",async(req,res)=>{
  try{
    console.logReq(req,"in nonProfits endpoint",req.params);
    var query= req.params.query;
    var data=await utils.nonProfitSearch(query);
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
app.post("/api/log/:key",async(req,res)=>{

  try{
    const log_key = process.env.LOG_KEY;
    const given_log_key= req.params.key;
    const validOrigins = process.env.LOGGING_ORIGINS.split(";");
    const data = req.body;
    const origin = req.headers.origin;

    if(log_key !== given_log_key)
        throw new AppError("log_key is not correct");
    

    if(validOrigins.indexOf(origin) !== -1){
      //inject ip address for each log
      utils.recordLog("web_logs",
        data.map(log => {
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
    const token = req.body.token;
    const action = req.body.action;
    const remoteIp = req.ip;

    if(token == null || token === "")
      throw new AppError("no token parameter found");
    if(action == null || action === "")
      throw new AppError("no action parameter found");
    if(remoteIp == null || req.ip === "")
      console.warn("while validating recaptcha token, could not get remote ip address");

    const score =await  utils.validateRecaptcha(token,action,remoteIp);


    res.setHeader("Content-Type","application/json");
    res.send({score:score});
  }catch(error){
    errorHandler(error,req,res)
  }
});
app.post("/api/contact/setup",async(req,res)=>{

  try{
    const data = req.body;

    const toEmail = await utils.userIdToEmail(data.profileUserId);
    console.log("email for user id "+data.profileUserId+": "+toEmail);
    const result =await  utils.contact(data.fromEmail,data.name,data.message,toEmail);
    console.log("contact result: ",result);


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





// Redirect all traffic to index.html
app.use((req, res) => res.sendFile(`${__dirname}/public/index.html`));

// Listen for HTTP requests on port 8080
app.listen(port, () => {
  console.log('listening on %d', port);
});

