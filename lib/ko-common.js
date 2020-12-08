
ko.bindingHandlers.selectize = {
  init: async function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      //console.log("selectize init ");
      var $element;
      var value = valueAccessor();
      var allBindings = allBindingsAccessor();
      var selectizeOptions = allBindings.selectizeOptions || {};

      const {default: selectize }  = await import(/* webpackChunkName: "selectize", webpackPrefetch: true */ './selectize-chunk');
      //since this blocks here while the library is loaded the first time, 
      // it's possible that the update method is called before we finish here.
      // so, the update method will check first if the library is loaded

      jQuery.data(element,"loaded",true);

      jQuery.data(element,"selectizeUpdating",false);

      if(selectizeOptions.onChange == null)
        selectizeOptions.onChange = function(changedValue){

          if(jQuery.data(element,"selectizeUpdating")){ //prevent cycles
            return;
          }

          if(value != null && ko.isObservable(value) && value() !== changedValue){
            console.log("changing value ",value(),changedValue);
            jQuery.data(element,"selectizeUpdating",true);
            value(changedValue);
            jQuery.data(element,"selectizeUpdating",false);
            console.log("value from obs after change: ",value());
          }

        }
      //TODO: add a ko init function here which passes in the observable


      jQuery(element).selectize(selectizeOptions);
  },
  update: function(element, valueAccessor, allBindingsAccessor,viewModel, bindingContext) {
      // This will be called once when the binding is first applied to an element,
      // and again whenever any observables/computeds that are accessed change
      // Update the DOM element based on the supplied values here.
      console.log("selectize updating");

      var $element = jQuery(element);
      var allBindings = allBindingsAccessor();
      var selectizeOptions = allBindings.selectizeOptions || {};
      var control = $element[0].selectize;
      var value = valueAccessor();
      var loaded = jQuery.data(element,"loaded");

      if(ko.isObservable(value))
        value(); //eval value to keep dependancy

      if(loaded == null ||  loaded === false)
        return;

      if(jQuery.data(element,"selectizeUpdating")){ //prevent cycles
        return;
      }

      //we need to prevent changes made here from triggering another update back
      //to the ko observalble. So the onChange callback on this selectize
      //will check for this value and not update anything if it is true.
      if(selectizeOptions.onObsUpdate != null){
        console.log("calling obObsUpdate");
        jQuery.data(element,"selectizeUpdating",true);
        selectizeOptions.onObsUpdate(control,value);
        jQuery.data(element,"selectizeUpdating",false);
      }
  },
  utils:{
    setOptions:function(api,obs){
      if(obs!=null && obs() != null)
        api.addOption(obs());
    },
    setItems:function(api,obs){
      if(obs!=null && obs() != null){
        if(ko.isObservableArray(obs) || Array.isArray(obs()))
          obs().forEach(function(item){
            api.addItem(item,true);
          });
        else  
          api.addItem(obs(),true);
      }
    },
    watchForNewOptions:function(api,obs){
      return obs.subscribe(function(newValue){
              if(newValue != null){
                  api.clearOptions(true);
                  api.addOption(newValue);
                  api.refreshOptions(false);
              }
          });
    }
  }
};

 ko.bindingHandlers.editor= {
  init: async function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      var $element = jQuery(element);
      var value = valueAccessor();
      var allBindings = allBindingsAccessor();
      var editorOptions = allBindings.editorOptions|| {};


      //console.log("editor init. value: ",value());
      var options = { }

      const {default: trumbowyg}  = await import(/* webpackChunkName: "trumbowyg", webpackPrefetch: true */ './editor-chunk');
      jQuery.data(element,"editor-loaded",true);
      jQuery.extend(options,editorOptions);
      
      //var editor  = new Editor(options);
      //jQuery.data(element,"editor",editor);
      var editor = $element.trumbowyg(options);

      if(editorOptions.editorInit != null){
        editorOptions.editorInit(editor);
      }
      $element.trumbowyg("html",value());
      editor.on("tbwchange",function(){
        var updateStatus = jQuery.data(element,"updating");
        if(updateStatus != null && updateStatus === true)
          return;

        //console.log("new data from editor");

        jQuery.data(element,"updating",true);
        value($element.trumbowyg("html"));
        jQuery.data(element,"updating",false);


      });
  },
  update: function(element, valueAccessor, allBindingsAccessor,viewModel, bindingContext) {
      // This will be called once when the binding is first applied to an element,
      // and again whenever any observables/computeds that are accessed change
      // Update the DOM element based on the supplied values here.
      var value = ko.unwrap(valueAccessor());
      var updateStatus = jQuery.data(element,"updating");
      var loaded = jQuery.data(element,"editor-loaded");
      if(updateStatus != null && updateStatus === true)
        return;
      if(loaded == null ||  loaded === false)
        return;

      //console.log("editor updating, new value from observable ");

      jQuery.data(element,"updating",true);
      jQuery(element).trumbowyg("html",value);
      jQuery.data(element,"updating",false);


  }
};
 ko.bindingHandlers.urlSuffix= {
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      var $element = jQuery(element);
      var value = valueAccessor();
      var allBindings = allBindingsAccessor();
      var urlBase = ko.unwrap(allBindings.urlBase) ;
      var noWWWHostname;
      var donationURL;
      var websiteURL;
      console.log("value: ",value(), urlBase);


      try{
        websiteURL = new URL(urlBase);
      }catch(error){
          console.error("failed to process given website url: "+error.message);
          return;
      }

      if(value() != null && value() !== ""){
        try{
          donationURL = new URL(value());
          // see if current value starts with urlBase as it should
          //if(value().indexOf(urlBase) !== 0 ){
          if( donationURL.hostname != websiteURL.hostname) {
            console.warn(`hostames do not match between website and donation URL. donation url: ${value()}, website: ${urlBase}`);
          }else{
            $element.val(donationURL.pathname + donationURL.search + donationURL.hash );
          }

        }catch(error){
          console.error("failed to process given donation url: "+error.message);
          //not a fatal error though, so just keep going
        }
      }

      noWWWHostname= websiteURL.hostname.replace("www.","");
      // this will accept either a complete url with hostname matching the website hostname, 
      //  or else a string that does not start with http (ie, is not a full URL), and is just a pathname
      $element.attr("pattern",`(?:^(?:https?:\/\/(?:www\.)?)(?=${noWWWHostname}\/).*)|(?:^(?!https?:\/\/).*)`);

      $element.change(function(){
        var inputVal = $element.val();
        var inputURL;
        var validationErrorClass="validation-error-message";
        var newURL= new URL(websiteURL.href);


        if(!checkForValidationError(element,validationErrorClass,function(validity){
              console.info("url validation failed: "+inputVal,validity);
              if(validity.valueMissing)
                return "Value required";
              return "Hostname does not match organizations";
        })){
          return;
        };

        try{
          if(inputVal.indexOf("http")===0){ //full URL given
            inputURL=new URL(inputVal);
          }else{ //just pathname given
            if(inputVal[0] === '/') 
              inputVal = inputVal.substring(1);
            // protocol and hostname will not be used from this var
            inputURL = new URL("http://example.com/"+inputVal);

          }
          //console.log("inputURL: "+inputURL.href);

          //keep hostname from newURL, but copy other parts
          newURL.pathname = inputURL.pathname;
          newURL.search = inputURL.search;
          newURL.hash= inputURL.hash;

        }catch(error){
          console.error("failed to process given input url: "+error.message);
          return;
        }

        //console.log("final donation url: "+newURL.href);
        $element.val(newURL.pathname + newURL.search+newURL.hash);
        value(newURL.href);

      });
  },
  update: function(element, valueAccessor, allBindingsAccessor,viewModel, bindingContext) {
  }
};
ko.bindingHandlers.validation= {
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      var $element = jQuery(element);
      var value = valueAccessor();
      var allBindings = allBindingsAccessor();
      var validationErrorClass="validation-error-message";
      var messages = {
        valueMissing:    'Value required',       // `required` attr
        emailMismatch:   'Please enter a valid email address',  // Invalid email
        patternMismatch: 'Custom pattern mismatch',// `pattern` attr
      }

      function getErrorMessage(validity){
        //console.log("validity: ",validity);
        if(validity.valueMissing)
          return messages.valueMissing;
        if(validity.typeMismatch)
          return "Value does not match required type: "+element.type;
        
        return "Validation Failed";
      }

      element.addEventListener('input', function(){
        checkForValidationError(element,validationErrorClass,getErrorMessage);
      });
  
  }
};

ko.bindingHandlers.inifiniteScroll= {
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      var $element = jQuery(element);
      //get callback function
      var value = valueAccessor();
      var callback = ko.unwrap(value);



      //this only seems to work with a global variable
      window.ergatas_triggered=false;
      //Infinite Scroll
      $(window).on("scroll", function() {
        var docHeight = $(document).height();
        var windowHeight = $(window).height();
        var top = $(window).scrollTop();

        //console.log(`doc ${docHeight}, window ${windowHeight}, top ${$(window).scrollTop()}, 
        //left ${(docHeight-300)},  bottom ${docHeight - $(window).scrollTop() - windowHeight}, triggered ${docHeight - top - windowHeight <= 300}`);

        // fire if the scroll position is 300 pixels above the bottom of the page.
        //make sure the total scrollable distance is greater than our threshold so 
        // we don't trigger on single screenful pages.
        if( (docHeight - windowHeight > 300) && (docHeight - top - windowHeight <= 300)){ 
            if(value != null && window.ergatas_triggered === false){
              window.ergatas_triggered=true;
              //console.log("Loading more content ");
              //console.log("bottom: "+(docHeight - top - windowHeight )+", docHeight: "+docHeight);
              callback();
            }
        }else{
          window.ergatas_triggered=false;
        }
      });
  }
}
function createErrorEl(element,validationErrorClass){
  var errorEl  = document.createElement('div');
  errorEl.className=validationErrorClass+" w-50 text-right";
  element.parentNode.insertBefore(errorEl,element);
  return errorEl;
}
function checkForValidationError(element,validationErrorClass,getErrorMessage){

  element.checkValidity();
  //$element.toggleClass("error",! element.validity.valid);
  if(element.validity.valid === false){
    setErrorOnElement(element,validationErrorClass,getErrorMessage(element.validity));
  }
  else //clear error message
    setErrorOnElement(element,validationErrorClass);

  return element.validity.valid;
} 
function setErrorOnElement(element,validationErrorClass,message){
  var $element  = jQuery(element);
  var container = $element.parents(".contains-validation-message");
  var errorEl = container.find(`.`+validationErrorClass)[0] || createErrorEl(element,validationErrorClass);
  var haveError = message != null && message !== "";

  $element.toggleClass("error",haveError);
  if(haveError){
    errorEl.textContent = message;
    jQuery(errorEl).show();
  }
  else
    jQuery(errorEl).hide();


}

function resetViewModel(viewModel,keyField,excludePattern){
    if(viewModel){
      //reset the key field first to ensure no partially reset
      //records can be stored on server
      if(keyField)
        viewModel[keyField](null); 
      for(key in viewModel){
        if(viewModel.hasOwnProperty(key) && 
           ko.isObservable(viewModel[key]) &&
           !ko.isComputed(viewModel[key])){
          //console.log("resetting "+key);

          if(excludePattern && key.match(excludePattern)){
            console.log("not resetting "+key+", matches pattern "+excludePattern);
            continue;
          }

          if(Array.isArray(viewModel[key]()) && viewModel[key].removeAll !== undefined)
            viewModel[key].removeAll();
          else
            viewModel[key](null);
        }
      }
    }
}

 
function withSpinner(spinnerBool,job){
  spinnerBool(true);
  return job().always(function(){spinnerBool(false);});
}
//for places where the whole contents of job would have been returned as a 
// function anyway. This saves typeing one layer of function nesting.
function withSpinnerAsFn(spinnerBool,job){
  return function(){
    return withSpinner(spinnerBool,job);
  }
}

