require('dotenv').config(); // read .env files
const express = require('express');
const { getJWT, getSignedUploadUrl, nonProfitSearch } = require('./lib/utils');

const session = require('express-session')
const FileStore = require('session-file-store')(session);

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
app.use(session({
  //genid: (req) => {
  //  console.log('Inside the session middleware')
  //  console.log(req.sessionID)
  //  return uuid() // use UUIDs for session IDs
  //},
  store: new FileStore(),
  secret: 'replacemewithENVpassword',
  resave: false,
  saveUninitialized: true
}))

// Set public folder as root
app.use(express.static('public'));

// Allow front-end access to node_modules folder
//app.use('/scripts', express.static(`${__dirname}/node_modules/`));



app.get("/api/getSignedUrl/:userKey/:filename",async(req,res)=>{
  try{
    var filename = req.params.filename;
    var userKey=req.params.userKey;
    console.log("getting upload url for filename ",userKey,filename);
    var url = await getSignedUploadUrl(userKey+"/"+filename);
    res.setHeader("Content-Type","application/json");

    res.send({url:url});
  }catch(error){
    errorHandler(error,req,res)
  }

});
app.get("/api/token/:code",async(req,res)=>{
  try{
    console.log("in token endpoint",req.params);
    var code= req.params.code;
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


// Redirect all traffic to index.html
app.use((req, res) => res.sendFile(`${__dirname}/public/index.html`));

// Listen for HTTP requests on port 8080
app.listen(port, () => {
  console.log('listening on %d', port);
});

