
function disableBackButton() {
	//console.log("creating backspace binding")
	document.onkeypress= function (event) {
		 var doPrevent = false;
		 //console.log("key press from "+event.keyCode)
		 if (event.keyCode === 8) {
			  var d = event.srcElement || event.target;
			  if ((d.tagName.toUpperCase() === 'INPUT' && (d.type.toUpperCase() === 'TEXT' || d.type.toUpperCase() === 'PASSWORD' || d.type.toUpperCase() === 'FILE')) 
					 || d.tagName.toUpperCase() === 'TEXTAREA') {
					doPrevent = d.readOnly || d.disabled;
			  }
			  else {
					doPrevent = true;
			  }

			 if (doPrevent) {
				  //console.log("preventing backspace")
				  event.preventDefault();
			 }else{
				 //console.log("backspace allowed")
			 }
		 }
	};
}
function scrollToBottom(offset){
	jQuery('html, body').animate({ 
		scrollTop: ($(document).height()-$(window).height())+offset}, 
		1400, 
		"swing"
	);
}
function scrollToTop(){
  jQuery("html, body").animate({ scrollTop: 0 }, "swing");
}
function isError(jsonResponse){
	return jsonResponse.hasOwnProperty("error");
}
function needLogin(jsonResponse){
  return isError(jsonResponse) && jsonResponse.error === "LOGIN_REQUIRED";
}
function setJsonError(id,jsonError){

	var errorUl=jQuery("<ul>");
	errorUl.append(jQuery('<li>').text(jsonError.error));

  if(Array.isArray(jsonError.subErrors)){
    var subErrorsUl = jQuery('<ul>')
    jsonError.subErrors.map(function(e){ 
      subErrorsUl.append(jQuery('<li>').text(e))
    })

    if(jsonError.subErrors.length != 0)
      errorUl.append(subErrorsUl);
  }
	setError(id,errorUl);
}
function setErrorString(message,id){
  setError(id,[message]);
}
function setError(id,error){

  if(typeof alertify !== 'undefined'){
    console.error("ERROR: ",error[0]);
    alertify.error(error[0],0)
  }else{
    var closeButton = jQuery( '<button type="button" class="close" data-dismiss="alert" aria-label="Close">');
    closeButton.append( '<span aria-hidden="true">&times;</span>');
    var errorBlock=jQuery("<div class='alert alert-danger alert-dismissible error_block'>");
    errorBlock.append(closeButton);
    errorBlock.append(error);

    jQuery('#'+id).html(errorBlock);
    jQuery('#'+id).show();
  }
}
function fetchJSON(url,errorId,success,onResultError){
  return jQuery.getJSON(url).
      then(function(result){
         //console.log("got json result: ",result);
       if(needLogin(result))
          window.location = ""; //force reload of current page
       else if(isError(result)){
           //when the call itself succeeds, but the result is an error message
           if(onResultError)
             onResultError(result);
           else
             setJsonError(errorId,result);
           
       }else
          //console.log("got json results: ",result);
          if(success)
            result = success(result);
          return result;
       },
       function(){
         setJsonError(errorId,
           {error:"failed to fetch json for "+url+" from server"});
       });
}

function postJSON(url,errorId,data,success){
  return jQuery.ajax(url,
        {
          type: "POST",
           contentType: "application/json",
           data:JSON.stringify(data),
           dataType:"json",
        }).then(function(result){
          console.log("post succeded");
          if(needLogin(result))
            window.location = ""; //force reload of current page
          else if(isError(result)){
            setJsonError(errorId,result);
            return jQuery.Deferred().rejectWith(result);
          }
          else if(success)
            return success(result);
        },
        function(){
          console.log("POST failed")
          setJsonError(errorId,
              {error:"failed to POST to server at "+url,
                subErrors: [JSON.stringify(data)]});
        });

}
function ajaxDelete(url,errorId,success){
  return jQuery.ajax(url,
        {
          type: "DELETE",
        }).then(function(result){
          console.log("post succeded");
          if(needLogin(result))
            window.location = ""; //force reload of current page
          else if(isError(result))
            setJsonError(errorId,result);
          else if(success)
            success(result);
        },
        function(){
          console.log("DELETE failed")
          setJsonError(errorId,
              {error:"failed to DELETE on server at "+url });
        });

}


function scrollToTop(){
  jQuery("html, body").animate({ scrollTop: 0 }, "slow");
}

function clearImageZoomer(){
  jQuery(".magnifyarea, .zoomtracker, .zoomstatus").remove();
}


function getURLParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [null, ''])[1].replace(/\+/g, '%20')) || null;
}


function round(number, precision) {
  var shift = function (number, precision) {
    var numArray = ("" + number).split("e");
    return +(numArray[0] + "e" + (numArray[1] ? (+numArray[1] + precision) : precision));
  };
  return shift(Math.round(shift(number, +precision)), -precision);
}
function isDisplayable(mimeType){
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}
function isConvertable(mimeType){
  var convertableTypes = [
    "text/plain",
    "application/msword",
    "application/pdf",
    "application/rtf",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/vnd.ms-word.document.macroenabled.12",
    "application/vnd.ms-works",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.text-template",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.sun.xml.writer",
    "application/vnd.wordperfect",
  ];
  return convertableTypes.indexOf(mimeType) !== -1;
}
function usingInternetExplorer(){
  var ua = window.navigator.userAgent;
  var msie = ua.indexOf("MSIE ");
  if(msie != -1){ //we are using internet explorer
    alertify.alert("Oh No!","<p>It looks like your using Internet Explorer. Sadly, MORF does not support "+
        "Internet Explorer. Please try opening this page in Firefox, Chrome or Safari. </p> "+
        "<p>Just copy the link below and paste in the location bar of another browser: </p>"+
        "<p>"+window.location.href+"</p>");
    return true;
  }
  return false;
}
 function loadSelectizeOptions(urlFn,onFinish){
    return function(query,callback){
      var url = urlFn(query);
      //console.log("selectize url: ",url);
      if(query.length  === 0)
        return callback();
      fetchJSON(url,"",function(results){
       // console.log("selectize query results: ", results);
        callback(results);
      }).fail(callback()).always(onFinish);
    }

  }

function isJson(item) {
    item = typeof item !== "string"
        ? JSON.stringify(item)
        : item;

    try {
      //console.log("testing if we can parse: ",item);
        item = JSON.parse(item);
      //console.log("It really is JSON!");
    } catch (e) {
        return false;
    }
    return typeof item === "object" && item !== null; 
}
function isInteger(s) {
    return /^\+?[1-9][\d]*$/.test(s);
}
//var collectionColors = {
//  language_name: "Green",
//  iso_code: "Purple",
//  program_name: "Blue",
//  location: "SteelBlue",
//  original: "#ff6600", //orange
//  label: "#ff0066", //
//
//};
var collectionInfo=null;
function withCollectionInfo(callback){
  if(collectionInfo == null)
    return fetchJSON("/morf/TableFeeds/morf/CollectionInfoView/all","",
      function(data){
        collectionInfo = {};
        data.forEach(function(obj){
          collectionInfo[obj.matchType] = obj;
        });
      }).
      then(function(){return callback(collectionInfo);});
  else
    return jQuery.Deferred().resolve().then(function(){return callback(collectionInfo);});
}
function collectionInputSetup(selector,onSelectionFn,limit=200){

  withCollectionInfo(function(){
     var element=jQuery(selector);
     element.typeahead(
     {
       limit: limit,
       remote: "/morf/Documents/collections/names/%QUERY?numResults="+limit,
       template: function(item){
         var header=item.matchType;
         var color ="gray";

         if(collectionInfo[item.matchType] != null){
            header= collectionInfo[item.matchType].title;
            color = collectionInfo[item.matchType].htmlColor;
         }

         return "<div class='suggestion'>"+
                "<span class='badge' style='background-color: "+color+"'> <b>"+
                  header+"</b></span> "+ item.matchedString+" ("+item.collectionKey+")"+
                "</div>";
       },

       classNames: {
         input: "form-control",
       }
     });

     element.on('typeahead:selected',
       function(name,datum){
          console.log("selected",name,datum);
          element.typeahead('setQuery', "");
          onSelectionFn(datum);


        });
     element.keyup(function(event){
       if(event.keyCode == 13) {//enter key 
          //console.log("enter pressed",event.currentTarget.value);
          if(!isNaN(event.currentTarget.value)){ //only trigger if its a number
            onSelectionFn({collectionKey:event.currentTarget.value});
            element.typeahead('setQuery', "");
          }

       }
     });
  });
}
function languageInputSetup(selector,onSelectionFn){

     var element=jQuery(selector);
     element.typeahead(
     {
       limit: 200,
       remote: "/morf/RecordistTools/languageNames/%QUERY",
       template: function(item){
         var header;
         var color;
         if(item.matchType === "language_name")
           return item.value+" ("+item.languageNumber+")"; 
         else if(item.matchType === "iso_code"){
           header = "ISO Code";
           color = "DarkGrey";
         }else if(item.matchType === "program_name"){
           header = "Program";
           color = "LightSlateGray";
         }else if(item.matchType === "location"){
           header = "Location";
           color = "LightSteelBlue";
         }else if(item.matchType === "original"){
           header = "Original";
           color = "#F5B041"; // light orange
         }


         return "<div class='suggestion' style='background-color: "+color+"'>"+
                  "<b>"+header+":</b> "+item.matchedString+"<br/>"+
                  item.value+" ("+item.languageNumber+")"+
                "</div>";
       },

       classNames: {
         input: "form-control",
       }
     });


     element.on('typeahead:selected',
       function(name,datum){
          console.log("selected",name,datum);
          onSelectionFn(datum.value,datum.languageNumber);

        });
     element.keyup(function(event){
       if(event.keyCode == 13) {//enter key 
          //console.log("enter pressed",event.currentTarget.value,event);
          if(!isNaN(event.currentTarget.value)){ //only trigger if its a number
            onSelectionFn("",event.currentTarget.value);
          }

       }
       //if(event.currentTarget.value === ""){
         //onSelectionFn("");
       //}
     });
}

function locationInputSetup(selector,onSelectionFn){

     var element=jQuery(selector);

     element.typeahead(
     {
       limit: 200,
       remote: "/morf/RecordistTools/locationNames/%QUERY",
       template: function(item){
         return item.value;
       },
       classNames: {
         input: "form-control",
       }
     });
     element.on('typeahead:selected',
       function(name,datum){
          console.log("selected",name,datum);
          onSelectionFn(datum.value,datum.key);

        });
     element.keyup(function(event){
       if(event.keyCode == 13) {//enter key 
          //console.log("enter pressed",event.currentTarget.value,event);
          if(!isNaN(event.currentTarget.value)){ //only trigger if its a number
            onSelectionFn("",event.currentTarget.value);
          }

       }
       if(event.currentTarget.value === ""){
         onSelectionFn("");
       }
     });
}

function camelize(str) {
  str = str.replace(/_/g," ");
  return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function(match, index) {
    if (+match === 0) return ""; // or if (/\s+/.test(match)) for white spaces
    return index == 0 ? match.toLowerCase() : match.toUpperCase();
  });
}
function snakeToTitle(str) {
  str = str.replace(/_/g," ");
  return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function(match, index) {
    if (+match === 0) return ""; // or if (/\s+/.test(match)) for white spaces
    return index == 0 ? match.toUpperCase() : " "+match.toUpperCase();
  });
}

function orderObjectsBy(array,fieldName){
  array!=null && array.sort(function(a,b){
    if(a[fieldName]< b[fieldName]) return -1;
    if(a[fieldName]> b[fieldName]) return 1;
    return 0;
  });
}
function randomInt(max){
  return Math.floor(Math.random()*Math.floor(max));
}

function indexByField(fieldName,objects){
  var result = {};
  objects.forEach(function(obj){
    result[obj[fieldName]] = obj;
  });
  return result;
};
function capitalizeFirstLetter(str) {
  if(str === "" || str == null)
    return str;
  return str[0].toUpperCase() +  str.slice(1);
}

function initZammadChat(id=1){
  // disabled as Zammad is no more
//  jQuery(function() {
//      new ZammadChat({
//        title: 'Get Help!',
//        background: '#327ab7',
//        fontSize: '12px',
//        //cssUrl: "/css/chat.css",
//        debug: false,
//        //host: "wss://zammad.globalrecordings.net/ws",
//        chatId: id,
//        show: false
//      });
//    });


}

function getMorfLogger(name,insertAsConsole=false){
  var logger,ajaxApp,consoleApp,layout;
  logger = log4javascript.getLogger(name);
  ajaxApp = new log4javascript.AjaxAppender("/morf/logger",true);
  layout = new log4javascript.JsonLayout(true,true);

  ajaxApp.setSendAllOnUnload(true);
  ajaxApp.setBatchSize(5);
  ajaxApp.setLayout(layout);
  //ajaxApp.setTimed(true);
  //ajaxApp.setTimerInterval(10000);
  ajaxApp.addHeader("Content-Type", "application/json");
  ajaxApp.setFailCallback(function(message){
    console.log("logging failure: ",message);
  });

  logger.addAppender(ajaxApp);


  if(insertAsConsole)
    insertLoggerAsConsole(logger);

  return logger;
}

//The logger given here MUST NOT have a console appender or 
// infinite recursion will occur.
function insertLoggerAsConsole(logger){

  var transfer= function(fnName,loggerFn){
    var origFn;
    if(window.console[fnName] != null){
      origFn = window.console[fnName];
      window.console[fnName] = function(){
        origFn.apply(null,arguments);
        //stringify any objects
        for(var i=0; i< arguments.length; i++){
          if(arguments[i] != null && typeof arguments[i] === 'object')
            //trim to 100 chars to make sure its not too big
            arguments[i]=JSON.stringify(arguments[i]).substr(0,100);
        }
        loggerFn.apply(logger,arguments);
      };
    }
  }
  if (window.console != null){

    transfer("trace",logger.trace);
    transfer("debug",logger.debug);
    transfer("info",logger.info);
    transfer("log",logger.info);
    transfer("warn",logger.warn);
    transfer("error",logger.error);
  }
}
