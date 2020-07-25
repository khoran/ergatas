//const { FilePond } = require("filepond");
import * as FilePond from 'filepond';
import FilePondPluginFileValidateSize from 'filepond-plugin-file-validate-size';
import FilePondPluginImagePreview from 'filepond-plugin-image-preview';
import FilePondPluginImageResize from 'filepond-plugin-image-resize';
import FilePondPluginImageExifOrientation from 'filepond-plugin-image-exif-orientation';
import FilePondPluginImageTransform from 'filepond-plugin-image-transform';
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type';


import 'trumbowyg/dist/ui/trumbowyg.min.css';
var trubowyg = require("trumbowyg");
jQuery.trumbowyg.svgPath="/img/trumbowyg-icons.svg";


ko.bindingHandlers.selectize = {
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      //console.log("selectize init");
      var $element = jQuery(element);
      var value = valueAccessor();
      var allBindings = allBindingsAccessor();
      var selectizeOptions = allBindings.selectizeOptions || {};

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
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      //console.log("selectize init");
      //var $element = jQuery(element);
      //var value = valueAccessor();
      //var allBindings = allBindingsAccessor();
      //var filePondOptions = allBindings.filepondOptions|| {};
      var filePondOptions = ko.unwrap(valueAccessor()) || {};


      //console.log("filepond init. files: ",value());
      FilePond.registerPlugin(
              FilePondPluginImagePreview,
              FilePondPluginImageExifOrientation,
              FilePondPluginImageTransform,
              FilePondPluginFileValidateSize,
              FilePondPluginImageResize,
              FilePondPluginFileValidateType
      );
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
 
ko.bindingHandlers.quill= {
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      //console.log("selectize init");
      //var $element = jQuery(element);
      var value = valueAccessor();
      var allBindings = allBindingsAccessor();
      var quillOptions = allBindings.filepondOptions|| {};


      console.log("quill init. value: ",value());
      var options = {
        theme: "snow",
      }
      jQuery.extend(options,quillOptions);

      var quill  = new Quill(element,options);
      jQuery.data(element,"quill",quill);

      quill.setText(value());

      if(quillOptions.quillInit != null){
        quillOptions.quillInit(quill);
      }
      quill.on('text-change',function(delta,oldDelta,source){
        console.log("new data from quill");
        jQuery.data(element,"updating",true);
        value(quill.getText());
        jQuery.data(element,"updating",false);

      });
  },
  update: function(element, valueAccessor, allBindingsAccessor,viewModel, bindingContext) {
      // This will be called once when the binding is first applied to an element,
      // and again whenever any observables/computeds that are accessed change
      // Update the DOM element based on the supplied values here.
      var value,quill;
      var updateStatus = jQuery.data(element,"updating");
      if(updateStatus != null && updateStatus === true)
        return;

      value  = valueAccessor();
      console.log("quill updating, new value from observable ");
      console.log(value());

      var quill  = jQuery.data(element,"quill");
      quill.setText(value());


  }
};
 ko.bindingHandlers.editor= {
  init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {

      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      //console.log("selectize init");
      var $element = jQuery(element);
      var value = valueAccessor();
      var allBindings = allBindingsAccessor();
      var editorOptions = allBindings.editorOptions|| {};


      console.log("editor init. value: ",value());
      var options = { }
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

        console.log("new data from editor");

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
      if(updateStatus != null && updateStatus === true)
        return;

      console.log("editor updating, new value from observable ");
      console.log(value);

      jQuery.data(element,"updating",true);
      jQuery(element).trumbowyg("html",value);
      jQuery.data(element,"updating",false);


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

