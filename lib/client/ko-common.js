
import * as mapUtils from './map';
import * as utils from './client-utils';
import slider from 'nouislider';
import 'nouislider/distribute/nouislider.css';

ko.bindingHandlers.selectize = {
  init: async function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      //console.log("selectize init ");
      var $element;
      var value = valueAccessor();
      var allBindings = allBindingsAccessor();
      var selectizeOptions = {};
      Object.assign(selectizeOptions, allBindings.selectizeOptions || {});

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
      var value = ko.unwrap(obs);
      if(value !=null)
        api.addOption(value);
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
      var validityCallbackFn = allBindings.validation;


      //console.log("editor init. value: ",value());
      var options = { }

      const {default: trumbowyg}  = await import(/* webpackChunkName: "trumbowyg", webpackPrefetch: true */ './editor-chunk');
      jQuery.data(element,"editor-loaded",true);
      jQuery.extend(options,editorOptions);
      
      var editor = $element.trumbowyg(options);

      var validate = function(){
        var valid = value() != null && value() !=="";
        if(! valid)
          utils.setErrorOnElement(element,"validation-error-message","Please add a description before publishing");
        else
          utils.setErrorOnElement(element,"validation-error-message","");
        
        if(validityCallbackFn != null)
          validityCallbackFn(valid);


 
      }

      if(editorOptions.editorInit != null){
        editorOptions.editorInit(editor);
      }
      $element.trumbowyg("html",value());
      validate();





      editor.on("tbwchange",function(){
        var updateStatus = jQuery.data(element,"updating");
        if(updateStatus != null && updateStatus === true)
          return;

        //console.log("new data from editor");

        jQuery.data(element,"updating",true);
        value($element.trumbowyg("html"));
        validate();
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

      //not needed
      //jQuery.data(element,"updating",true);
      //jQuery(element).trumbowyg("html",value);
      //jQuery.data(element,"updating",false);


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
      console.log("urlSuffix value: ",value);


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
      $element.attr("pattern",`^\\s*https?:\/\/(?:[a-zA-Z0-9\\-]+\\.)*${rootHostname}(\\/.*)?$`);

      $element.on('change',function(){
        var inputVal = $element.val();
        var inputURL;
        var validationErrorClass="validation-error-message";


        if(!checkForValidationError(element,validationErrorClass,function(validity){
              console.info("url validation failed: '"+inputVal+"'",validity);
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
      var callbackFn = valueAccessor();
      var allBindings = allBindingsAccessor();
      var validationErrorClass="validation-error-message";
      var validity;
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

      if(element.checkValidity != null) //avoid error if set on an element that can't be validated
        element.addEventListener('input', function(){
          validity = checkForValidationError(element,validationErrorClass,getErrorMessage);
          if(callbackFn != null)
            callbackFn(validity);
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
ko.bindingHandlers.addThis= {
  init: async function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
      //init social sharing buttons
      if(window.addthis && window.addthis.toolbox)
          window.addthis.toolbox(".addthis_toolbox");
  }
}


ko.bindingHandlers.impactMap= {
  init: async function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      var $element = jQuery(element);
      var allBindings = allBindingsAccessor();
      //get callback function
      var countryCodes = ko.unwrap(valueAccessor());
      var currentLocation = allBindings.currentLocation;

      const {default: datamaps }  = await import(/* webpackChunkName: "impact-map-chunk", webpackPrefetch: true */ './impact-map-chunk');


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
      var navy = "#012245"
      countryCodes.forEach((countryCode) =>{
        highlights[countryCode] = gold;
      });
      if(currentLocation != null && currentLocation !== ""){
        highlights[currentLocation] = navy;
      }
      map.updateChoropleth(highlights);


  }
}
ko.bindingHandlers.clamped= {
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
    var selector = valueAccessor();

    var clampValue = 15;
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
ko.bindingHandlers.videoURL= {
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
    var $element = jQuery(element);
    var update = function(){
      console.log("vurl Updating videoURL");
      var givenURL = $element.val();
      console.log("vurl videoURL. givenURL: "+givenURL);
      var normalizedURL = utils.normalizeVideoURL(givenURL);
      console.log("vurl videoURL. normalized: "+normalizedURL);
      $element.val(normalizedURL);
    }

    update();

    jQuery(element).on("change paste ",function(){
      console.log("vurl video url updated: ");
      update();

    })
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

      if( ! newEl){
            return;
      }

      //if we don't want a visual transition or, we're already in the middle of a transition
      if((allBindings.transition != null && ko.unwrap(allBindings.transition)===false) 
          || window.ergatas_in_page_transition === true){
        //console.log("No transition requested, or already in a page transition");
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

 
ko.bindingHandlers.accordionScrollFix= {
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

    $(element).find('.collapse').on('show.bs.collapse', function(e) {
      var $card = $(this).closest('.card');
      var $open = $($(this).data('parent')).find('.collapse.show');

      var additionalOffset = 0;
      if($card.prevAll().filter($open.closest('.card')).length !== 0)
      {
            additionalOffset =  $open.height();
      }
      $('html,body').animate({
        scrollTop: $card.offset().top - additionalOffset
      }, 500);
    });


  }
}
ko.bindingHandlers.noSubmitOnEnter= {
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
      //only submit form if enter is pressed while a button is focused
      $(element).on('keypress', function(e) {
          var attr = $(e.target).attr('type');
          if(e.keyCode === 13){
            return attr==='button' || attr=='submit';
          }
          return true;
      });
  }
}
 
ko.bindingHandlers.supportSlider= {
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

    var observables= valueAccessor();
    var initialValues;
    var allBindings = allBindingsAccessor();
    var options;
    var starts, tooltips;

    if(!Array.isArray(observables)){
      console.error("supportSlider not given array: ",observables);
      return;
    }


    if(observables.length === 1){
      starts = [0];
    }else { //assume array of length 2
      starts = [0,100];
    }
    tooltips = observables.map( () => true);


    options = {
      //start: [0, 100],
      start: starts,
      connect: true,
      margin: 5,
      step: 1,
      //tooltips: [true,true],
      tooltips: tooltips,
      format: {
        to: function(value){
          return value+"%";
        },
        from: function(value){
          return value.replace("%","");
        }
      },
      range: {
          'min': 0,
          'max': 100
      }
    };
    Object.assign(options, allBindings.sliderOptions || {});
    initialValues = observables.map( o => o());
    console.log("initial values: ",initialValues);


    slider.create(element, options);
    element.noUiSlider.set(initialValues);

    element.noUiSlider.on("change",function(values){
      console.log("slider values changed: ",values);
      values.map((value,index) =>{
        try{
          value = parseInt(value);
          if(options.resetOnEndpoints === true && (value === 0 || value === 100))
            observables[index](undefined);
          else
            observables[index](value);
        }catch(e){

        }
      });
    });

  },
  update: function(element, valueAccessor, allBindingsAccessor,viewModel, bindingContext) {
      // This will be called once when the binding is first applied to an element,
      // and again whenever any observables/computeds that are accessed change
      // Update the DOM element based on the supplied values here.
      var observables= valueAccessor();
      var newValues;

    if(!Array.isArray(observables) && observables.length >= 2){
      console.error("supportSlider not given array: ",observables);
      return;
    }
      //console.log("updating slider values to: ",observables);
      newValues = observables.map( o => o());
      if(newValues[0] == null)
        newValues[0] = 0;
      if(newValues[1] == null)
        newValues[1] = 100;

      element.noUiSlider.set(newValues);
  
  }
}

ko.bindingHandlers.birthYears = {
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
      var value = valueAccessor();
      console.log("init birthYears value: ",value());
      var $element = jQuery(element);
      var doUpdate;

      var validate = function(){

        var rawEntries = $element.val().split(",").
                           map((x) => x.trim()).
                           filter((x) => x !== "");
        var finalEntries = rawEntries.filter((entry) => entry.match(/^\s*\d{4}\s*$/));
        //console.log("raw: ",rawEntries);
        //console.log("final: ",finalEntries);
       
        var valid = rawEntries.length === finalEntries.length;
        //console.log("validating birth years. valid?:", valid);
        if(! valid)
          utils.setErrorOnElement(element,"validation-error-message","Must be a comma separated list of years (YYYY).");
        else
          utils.setErrorOnElement(element,"validation-error-message","");
       
        return finalEntries;
      }

      // make sure input is an array
      if( ! Array.isArray(value()))
        value(value().split(","));

      $element.val(value().join(", "));
      validate();

      $element.on("keyup",() =>{
        //console.log("birthYears element keydown: ",$element.val());
        window.clearTimeout(doUpdate);
        doUpdate = setTimeout(() =>{
           var finalEntries = validate();
           //console.log("setting final entries: ",finalEntries);
           value(finalEntries);
        },500);
      });

  }
}

ko.extenders.arrayCompare = function(target, options) {
    //create a writable computed observable to intercept writes to our observable
    var result = ko.pureComputed({
        read: target,  //always return the original observables value
        write: function(newValue) {
            var current = target();
            //console.log("arrayCompare: writing value.  "+current+" --> "+newValue);
 
            //only write if it changed
            if ( newValue !== current && ! utils.arrayEquals(newValue,current)){
                //console.log("values not equal");
                target(newValue);
            } else {
              //console.log("not updating array value as arrays are equal: ",current,newValue);
            }
        }
    }).extend({ notify: 'always' });
 
    //initialize with current value to make sure it is rounded appropriately
    result(target());
 
    return result;
};

ko.extenders.async = function(computedDeferred, initialValue) {
 
  console.log("in async extender");
    var plainObservable = ko.observable(initialValue), currentDeferred;
    var rejectCurrentDeferred;
    plainObservable.inProgress = ko.observable(false);
 
    ko.computed(function() {
        if (currentDeferred && rejectCurrentDeferred) {
            rejectCurrentDeferred();
            //currentDeferred.reject();
            currentDeferred = null;
        }
 
        var newDeferred = computedDeferred();
        console.log("newDeferred: ",newDeferred);
        if (newDeferred &&
            (newDeferred instanceof Promise)) {
            //(typeof newDeferred.done == "function")) {
 
              console.log("Deferred value found: ",newDeferred);
            // It's a Promise
            plainObservable.inProgress(true);
 
            // Create our own wrapper so we can reject
            //currentDeferred = jQuery.Deferred().done(function(data) {
            //    plainObservable.inProgress(false);
            //    plainObservable(data);
            //});

            currentDeferred = new Promise((resolve,reject) => {

              newDeferred.then((data) =>{
                  plainObservable(data);
                  resolve();
              }).catch( error => {
                  console.warn("error in async extender promise: ",error);
                  reject();
              }).finally(() =>{
                  plainObservable.inProgress(false);
              });
            });
        } else {
            // A real value, so just publish it immediately
            plainObservable(newDeferred);
        }
    });
 
    return plainObservable;
};


function checkForValidationError(element,validationErrorClass,getErrorMessage){

  element.checkValidity();
  if(element.validity.valid === false){
    utils.setErrorOnElement(element,validationErrorClass,getErrorMessage(element.validity));
  }
  else //clear error message
    utils.setErrorOnElement(element,validationErrorClass);

  return element.validity.valid;
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

