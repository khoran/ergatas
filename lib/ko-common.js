
ko.bindingHandlers.selectize = {
  init: async function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      //console.log("selectize init");
      var $element = jQuery(element);
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

          if(value != null && value() !== changedValue){
            console.log("changing value ",value(),changedValue);
            value(changedValue);
          }

        }
      //TODO: add a ko init function here which passes in the observable
      $element.selectize(selectizeOptions);
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
      var value = ko.unwrap(valueAccessor());
      var loaded = jQuery.data(element,"loaded");
      if(loaded == null ||  loaded === false)
        return;

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
        if(ko.isObservableArray(obs))
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

ko.bindingHandlers.filepond= {
  init:  async function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      //var $element = jQuery(element);
      //var value = valueAccessor();
      //var allBindings = allBindingsAccessor();
      //var filePondOptions = allBindings.filepondOptions|| {};
      var filePondOptions = ko.unwrap(valueAccessor()) || {};



      const {default: FilePond}  = await import(/* webpackChunkName: "filepond", webpackPrefetch: true */ './upload');
      console.log("FilePond:",FilePond);


      //console.log("filepond init. files: ",value());
    
      var options = {
        onprocessfile: (error,file) =>{
            console.log("on process file: ",error,file);
            //value.push(file.filename);
            //console.log("new filepond value: "+JSON.stringify(value()));
        },
      }
      jQuery.extend(options,filePondOptions);

      setTimeout( () =>{ //TODO: UI doesn't display correctly without this , fix it!
        var pond = FilePond.create(element,options);
        if(filePondOptions.filePondInit != null){
          filePondOptions.filePondInit(pond);
        }
      },1000);
  },
  update: function(element, valueAccessor, allBindingsAccessor,viewModel, bindingContext) {
      // This will be called once when the binding is first applied to an element,
      // and again whenever any observables/computeds that are accessed change
      // Update the DOM element based on the supplied values here.
      console.log("filepond updating");

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
      var suffix;
      console.log("value: ",value(), urlBase);


      // see if current value starts with urlBase as it should
      if(value().indexOf(urlBase) !== 0 ){
        console.warn("initial value of urlSuffix does not start with given urlBase",value(),urlBase);
        suffix="";
      }else{
        suffix = value().replace(urlBase,"");
      }
      $element.val(suffix);
      $element.attr("pattern","(?:"+urlBase+".*)|(?!https?://).*");

      $element.change(function(){
        var inputVal = $element.val();

        //see if user provided a full URL, already including the base
        if(inputVal.indexOf(urlBase) === 0){
          //remove it
          $element.val(inputVal.replace(urlBase,""));
        }else if(inputVal.indexOf("http")===0){
          //user has pasted a URL with the wrong domain
          //pattern set above should trigger validation error
        }
        value(urlBase+$element.val());
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
        if(validity.valueMissing)
          return messages.valueMissing;
        return "Validation Failed";
      }

      element.addEventListener('input', function(){
        var parent = element.parentNode;
        var errorEl = parent.querySelector(`.`+validationErrorClass) || document.createElement('div');
        element.checkValidity();
        $element.toggleClass("error",! element.validity.valid);
        if(element.validity.valid === false){
          errorEl.className = validationErrorClass
          errorEl.textContent = getErrorMessage(element.validity);
          parent.insertBefore(errorEl,element);
        }
        else
          errorEl.remove();

      });
  
  }
};






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

