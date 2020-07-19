require('dotenv').config(); // read .env files
const express = require('express');
const { getJWT,jwtPayload, getSignedUploadUrl, nonProfitSearch,
       notifyOrgApplication,removeFile,listUserFiles } = require('./lib/utils');

//const session = require('express-session')
//const FileStore = require('session-file-store')(session);

const app = express();
const port = process.env.PORT || 8080;


const errorHandler = (err, req, res) => {
  console.error(err);
  if (err.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    res.status(403).send({ title: 'Server responded with an error', message: err.message });
  } else if (err.request) {
    // The request was made but no response was received
    res.status(503).send({ title: 'Unable to communicate with server', message: err.message });
  } else {
    // Something happened in setting up the request that triggered an Error
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

// Set public folder as root
app.use(express.static('public'));

// Allow front-end access to node_modules folder
//app.use('/scripts', express.static(`${__dirname}/node_modules/`));

app.use(express.json());



app.post("/api/getSignedUrl",async(req,res)=>{
  try{
    var filename = req.body.filename;
    var userKey = jwtPayload(req.body.token).sub;
    console.log("getting upload url for filename ",userKey,filename);
    var url = await getSignedUploadUrl(userKey,filename);
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
    var userKey = jwtPayload(req.body.token).sub;
    console.info("removing file "+filename);
    await removeFile(userKey,filename);
    res.setHeader("Content-Type","application/json");
    res.send({});
  }catch(error){
    errorHandler(error,req,res)
  }
});
app.post("/api/listUserFiles",async(req,res)=>{
  try{
    var userKey = jwtPayload(req.body.token).sub;
    console.info("listing files for user "+userKey);
    var files = await listUserFiles(userKey );
    console.log("files: ",files);
    res.setHeader("Content-Type","application/json");
    res.send(files);
  }catch(error){
    errorHandler(error,req,res)
  }
});


app.post("/api/token",async(req,res)=>{
  try{
    console.log("in token endpoint",req.params);
    var code= req.body.code;
    var data=await getJWT(code);
    console.log("data: ",data);

    res.setHeader("Content-Type","application/json");
    res.send(data);
    

  }catch (error){
    errorHandler(error,req,res)
  }
});
app.get("/api/nonProfits/:query",async(req,res)=>{
  try{
    console.log("in nonProfits endpoint",req.params);
    var query= req.params.query;
    var data=await nonProfitSearch(query);
    //console.log("data: ",data);

    res.setHeader("Content-Type","application/json");
    res.send(data);
  }catch (error){
    errorHandler(error,req,res)
  }
});
app.post("/api/orgAppNotify",async(req,res)=>{

  try{
    var profile_key= req.body.profile_key;
    notifyOrgApplication(profile_key);
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

