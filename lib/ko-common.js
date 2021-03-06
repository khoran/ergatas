
import * as mapUtils from './map';
import * as utils from './client-utils';
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
            //console.log("changing value ",value(),changedValue);
            jQuery.data(element,"selectizeUpdating",true);
            value(changedValue);
            jQuery.data(element,"selectizeUpdating",false);
            //console.log("value from obs after change: ",value());
          }

        }
      //TODO: add a ko init function here which passes in the observable


      jQuery(element).selectize(selectizeOptions);
  },
  update: function(element, valueAccessor, allBindingsAccessor,viewModel, bindingContext) {
      // This will be called once when the binding is first applied to an element,
      // and again whenever any observables/computeds that are accessed change
      // Update the DOM element based on the supplied values here.
      //console.log("selectize updating");

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
        //console.log("calling obObsUpdate");
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
      var rootHostname, valueRootHostname;
      var donationURL;
      var websiteURL;
      var rootPattern = /^.*?([a-zA-Z0-9-]+.[a-zA-Z0-9-]+)$/;
      //console.log("value: ",value(), urlBase);


      try{
        websiteURL = new URL(urlBase);
      }catch(error){
          console.error("failed to process given website url: "+error.message);
          return;
      }
      rootHostname= websiteURL.hostname.replace(rootPattern,"$1");

      if(value() != null && value() !== ""){
        try{
          donationURL = new URL(value());
          valueRootHostname= donationURL.hostname.replace(rootPattern,"$1");
          // see if current value starts with urlBase as it should
          if( rootHostname !== valueRootHostname ) {
            console.warn(`root hostames do not match between website and donation URL. donation url: ${value()}, website: ${urlBase}`);
          }else{
            $element.val(donationURL.href);
          }

        }catch(error){
          console.error("failed to process given donation url: "+error.message);
          //not a fatal error though, so just keep going
        }
      }


      // this will accept a complete URL, but allow additional sub-domains to be specified
      $element.attr("pattern",`^https?:\/\/(?:[a-zA-Z0-9-]+\\.)*${rootHostname}(\\/.*)?$`);

      $element.change(function(){
        var inputVal = $element.val();
        var inputURL;
        var validationErrorClass="validation-error-message";


        if(!checkForValidationError(element,validationErrorClass,function(validity){
              console.info("url validation failed: "+inputVal,validity);
              if(validity.valueMissing)
                return "Value required";
              return "Hostname does not match organizations";
        })){ // there was a validation error
          return;
        };

        try{
          inputURL=new URL(inputVal);

        }catch(error){
          console.error("failed to process given input url: "+error.message);
          return;
        }
        value(inputVal);
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

ko.bindingHandlers.infiniteScroll= {
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      var $element = jQuery(element);
      //get callback function
      var value = valueAccessor();
      var callback = ko.unwrap(value);

      var allBindings = allBindingsAccessor();
      var containerSelector= allBindings.containerSelector;
      var container = $element.closest(containerSelector)[0];

      //this only seems to work with a global variable
      window.ergatas_triggered=false;

      //console.log(" ============== infinity scroll init. selector: ",containerSelector,container);

      var checkTrigger = function(docHeight,windowHeight,top){

          //console.log(`doc ${docHeight}, window ${windowHeight}, top ${top}, 
          //left ${(docHeight-300)},  bottom ${docHeight - top - windowHeight}, triggered ${docHeight - top - windowHeight <= 300}`);

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

      }

      if(container){
        var $container = $(container);
        $(window).off("scroll");

        $container.on("scroll", function() {
          var docHeight = container.scrollHeight;
          var windowHeight = $container.height();
          var top = $container.scrollTop();

          checkTrigger(docHeight,windowHeight,top);
        });
      }else{
        $(window).on("scroll", function() {
          var docHeight = $(document).height();
          var windowHeight = $(window).height();
          var top = $(window).scrollTop();

          checkTrigger(docHeight,windowHeight,top);
        });
      }
  }
}

ko.bindingHandlers.impactMap= {
  init: async function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      var $element = jQuery(element);
      //get callback function
      var countryCodes = ko.unwrap(valueAccessor());

      const {default: datamaps }  = await import(/* webpackChunkName: "impact-map-chunk", webpackPrefetch: true */ './impact-map-chunk');

      mapUtils.initMap().then( async function(platform){
          const defaultLayers = platform.createDefaultLayers();
          const options = {
                  center:  {lat:0,lng:0},
                  zoom: 0 ,
                  //bounds: new H.geo.Rect(-85,-180,85,180),
                  pixelRatio: window.devicePixelRatio || 1
              };


          var map = new Datamap({element: element,
          
            //height: 200,
            //aspectRatio: 1,
            responsive:true,
            fills:{
              defaultFill: "#bab6a5",
            },
            geographyConfig: {
              popupOnHover:false
            }
          });

          $(window).on('resize', function() {
            map.resize();
          });
          var highlights = {};

          var gold=  "#edb53a"; 
          countryCodes.forEach((countryCode) =>{
            highlights[countryCode] = gold;
          });
          map.updateChoropleth(highlights);

          /*
          const map = new H.Map(element, defaultLayers.vector.normal.map, options);
          const mapEvents = new H.mapevents.MapEvents(map);
          const behavior = new H.mapevents.Behavior(mapEvents);
          const ui = new H.ui.UI(map,{zoom:true});

          //mapUtils.showGeoJSONData(map);



          //const shapes = await mapUtils.getAllCountryShapes(countryCodes);

          //console.log("shapes: ",shapes);

          
          //shapes.forEach((shape)=>{
              //mapUtils.addShape(map,shape);
          //});
          */
          

      });

  }
}
ko.bindingHandlers.clamped= {
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
    var selector = valueAccessor();

    var clampValue = 5;
    var height = utils.getMaxHeight(clampValue,element);
    var sty = element.style;

    //console.log(`clamp value: ${clampValue}, height: ${height}, clientHeight: ${element.clientHeight}`);

    if (height <= element.clientHeight ) {
        //console.log("running onTruncate");
        sty.height = String(clampValue * 1.2) + "em";
        jQuery(selector).show();
    }
  }
}

 
ko.bindingHandlers.element= {
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      var $element = jQuery(element);
      var value = valueAccessor();

      var newEl = ko.unwrap(value);
      window.ergatas_in_page_transition=false;
      if( ! newEl)
        return;

      ko.applyBindings(viewModel,newEl[0]);
      console.log("init replacing element ",$element);
      console.log("init with new el ",newEl);
      $element.empty();
      $element.append(newEl);

  },
  update: function(element, valueAccessor, allBindingsAccessor,viewModel, bindingContext) {
      // This will be called once when the binding is first applied to an element,
      // and again whenever any observables/computeds that are accessed change
      // Update the DOM element based on the supplied values here.
      var $element = jQuery(element);
      var newEl= ko.unwrap(valueAccessor());
      var ww = window.innerWidth;
      var allBindings = allBindingsAccessor();
      var oldPage;
      var time=600;
      //var time=3000;

      if( (allBindings.transition != null && ko.unwrap(allBindings.transition)===false) 
          || ! newEl){
            return;
      }

      if(window.ergatas_in_page_transition === true){
        console.warn("Already in a page transition");
        $element.children().stop(true);
        $element.empty();
        $element.append(newEl);
        ko.applyBindings(viewModel,newEl[0]);
        window.ergatas_in_page_transition=false;
        return;
      }

      //console.log("window inner width: "+ww);
      //console.log("update replacing element ",$element);
      //console.log("update with new el ",newEl);

      try{

        window.ergatas_in_page_transition=true;

        oldPage= $element.children().first();
        oldPage.toggleClass("page-in-transition",true);
        newEl.toggleClass("page-in-transition",true);
        newEl.css({left:ww});

        $element.append(newEl);
      }catch(error){
        console.warn("error in page transition init: "+error,error);
      }
      try{
        ko.applyBindings(viewModel,newEl[0]);
      }catch(error){
        console.warn("failed to apply page bindings during page transition: "+error,error);
      }
      try{

        $element.height(Math.max(oldPage.height(),newEl.height()));

        oldPage.animate({left:ww},{
          duration:time,
          queue:false,
          complete: function(){
                //console.log("OLD PAGE DONE");
                oldPage.remove();
                //in case some stray clicks triggered this whole function multiple times
                $element.children().not(':first').remove();
          }
        });
        newEl.animate({left:0},{
          duration: time, 
          queue:false,
          complete: function(){
            //console.log("NEW EL DONE");

            newEl.toggleClass("page-in-transition",false);
            $element.css({height:''});
            window.ergatas_in_page_transition=false;
          }
        });
      }catch(error){
        window.ergatas_in_page_transition=false;
        console.warn("animated transition failed, just setting page. "+error,error);
        $element.empty();
        $element.append(newEl);
      }
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

