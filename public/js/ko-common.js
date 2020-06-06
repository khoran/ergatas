
ko.extenders.async = function(computedDeferred, initialValue) {
 
    var plainObservable = ko.observable(initialValue), currentDeferred;
    plainObservable.inProgress = ko.observable(false);
 
    ko.computed(function() {
        if (currentDeferred) {
            currentDeferred.reject();
            currentDeferred = null;
        }
 
        var newDeferred = computedDeferred();
        if (newDeferred &&
            (typeof newDeferred.done == "function")) {
 
            // It's a deferred
            plainObservable.inProgress(true);
 
            // Create our own wrapper so we can reject
            currentDeferred = jQuery.Deferred().done(function(data) {
                plainObservable.inProgress(false);
                plainObservable(data);
            });
            newDeferred.done(currentDeferred.resolve);
        } else {
            // A real value, so just publish it immediately
            plainObservable(newDeferred);
        }
    });
 
    return plainObservable;
};
ko.bindingHandlers.stopBinding = {
  init: function() {
    return { controlsDescendantBindings: true };
  }
};
ko.bindingHandlers.zoomable= {
  update: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
    var $element = jQuery("#"+element.id);
    //console.log("adding image zoom to ",element.id,$element);
    $element.addimagezoom({
      zoomrange: [3,10],
      magnifiersize:[600,500],
      largeimage: valueAccessor(),
    });


    //  trigger loading of large image as soon as base image is loaded
// sometimes triggers too early. If final image position changes because of some 
//page elements that are slow to load, then the zoom tracker area is off.
// Ok to use as long as image height and width are both specified ahead of time.
    if( ! allBindingsAccessor.has("noAutoZoomLoad")){
      $element.load(function(){
        //console.log("triggering zoom load");

        var offset = $element.offset();
        var zoomTrackerEl = jQuery(".zoomtracker").filter(function(){
          return jQuery(this).css('top') === (offset.top+'px');
        });
        zoomTrackerEl.mouseover();
        zoomTrackerEl.mouseout();
      });
    }
  }
}
ko.bindingHandlers.unitegallery = {
  
  init: function(element, valueAccessor, allBindingsAccessor,viewModel,context) {
     //console.log("unitegallery init");
     return ko.bindingHandlers.template.init(element, valueAccessor, allBindingsAccessor, viewModel, context);
  },
  update: function(element, valueAccessor, allBindingsAccessor,viewModel,context) {
     //console.log("unitegallery update",element);

    var defaultOptions = {
      gallery_theme: "tiles",
      gallery_width:"100%",
      lightbox_type: "compact",
    };
    var options = allBindingsAccessor.get('unitegalleryOptions') || defaultOptions;
    var templateName= allBindingsAccessor.get('unitegalleryTemplate') ;
    var data = ko.unwrap(valueAccessor());
    var templateOptions = function(){
      return {
        name: templateName,
        foreach: data,
      };
    };
    var api;


    ko.utils.domData.clear(element);
    ko.utils.emptyDomNode(element);

    //create child image blocks
    ko.bindingHandlers.template.update(element, templateOptions, allBindingsAccessor, viewModel, context);

    if(data && data.length > 0){
      api=jQuery(element).unitegallery(options);
      if(options.init!= null)
        options.init(api);
    }
    

    return { controlsDescendantBindings: true };

  }
}
ko.bindingHandlers.dataTable = {
  init: function(element, valueAccessor, allBindingsAccessor,viewModel,context) {
     //console.log("dataTable init");
     //return ko.bindingHandlers.foreach.init(element, valueAccessor, allBindingsAccessor, viewModel, context);
     var options = allBindingsAccessor.get('dataTableOptions') || {};
     if(options.data != null)
       return { controlsDescendantBindings: true };
     else
       return ko.bindingHandlers.template.init(element, valueAccessor, allBindingsAccessor, viewModel, context);
  },
  update: function(element, valueAccessor, allBindingsAccessor,viewModel,context) {
    //console.log("dataTable update. ",element);

    var defaultOptions = { };
    var options = allBindingsAccessor.get('dataTableOptions') || defaultOptions;
    var templateName= allBindingsAccessor.get('dataTableTemplate') ;
    var data = ko.unwrap(valueAccessor());
    var tableEl = jQuery(element).closest('table');
    var datatable;

    var templateOptions = function(){
      return {
        name: templateName,
        foreach: data,
      };
    };

    if(options.data !== undefined) 
      options.drawCallback = function(settings){
          var api = new jQuery.fn.dataTable.Api( settings );
          var i;
          var tablerows;
          console.log("===== after init, binding table rows ===== ");
          tableRows = jQuery(element).children();
          rowData = api.rows({page:"current"}).data();

          for(i = 0; i< tableRows.length; i++){
            //console.log("data "+i+": ",rowData[i].description());
            //console.log("row "+i+": ",tableRows[i]);
            if(ko.dataFor(tableRows[i]) !== rowData[i]){
              ko.applyBindings(rowData[i],tableRows[i]);
            }
          }
        }

    tableEl.DataTable().clear().destroy();

    ko.utils.domData.clear(element);
    ko.utils.emptyDomNode(element);

    if(options.data === undefined) //don't render rows if data option is given
      ko.bindingHandlers.template.update(element, templateOptions, allBindingsAccessor, viewModel, context);

    if(data && data.length > 0){
      datatable = tableEl.DataTable(options);

      if(options.init!= null)
        options.init(datatable);
      //if(options.tableRef) //store the datatable in the given observable
        //options.tableRef(datatable); 
      
      //enable auto-open of next field when a field is saved
      //only works within a row
      tableEl.find('.editable').on('hidden', function(e, reason){
            //console.log("editable hidden. ", reason);
            if(reason === 'save' || reason === 'nochange') {
                var $next = jQuery(this).closest('td').nextAll(":has('.editable')").first().find('.editable');
                setTimeout(function() {
                    $next.editable('show');
                }, 300); 
            }
      });


    }

    return { controlsDescendantBindings: true };
  }

}
ko.bindingHandlers.dbField = {
  
  //<div class="form-group" >
  //  <label >Recommended Name:</label>
  //  <a  data-bind="editable: language" ></a>
  //</div>

  /* options:
   * One of the following is required
   * field: observable name as a text field
   * lookup: observable as a drop down, will look for a options_ list for options
   * checkbox: observable as a boolean
   * date: observable as a date picker
   *
   * label: field name (required)
   *
   * optional
   * --------
   * readOnly: value is editable only if this is false. Default to false.
   * editableOptions: options to be passed to editable object
   * options: additional things to add to the data-bind on the value
   * inline: put field name on same line as value. default to true.
   * append: an element to include inside div at the end
   *
   */
  init: function(element, valueAccessor, allBindingsAccessor,viewModel,context) {
     var label = jQuery("<label></label")
     var link = jQuery("<input class='form-control'></input>");
     var formGroup;
     var value = valueAccessor();
     var dataBind="";
     var editableOptions={emptytext: "Click to Edit"};
     var lookupType="";
     var separator="&nbsp;";


     //default to inline, unless a false value is actually given
     if(value.inline != null && value.inline===false)
       separator = "<br/>";

     //console.log("dbField init",element);
     //console.log("value: ",value);
     if(value.editableOptions)
       editableOptions = jQuery.extend(editableOptions,value.editableOptions);

     if(value.label)
       label.text(value.label+": ");

     if(value.field)
       dataBind = "value: "+value.field;
     else if(value.lookup){
       if(value.readOnly){
         link = jQuery("<span></span>");
         dataBind = "beanReadOnlyLookup: "+value.lookup;
       }
       else
         dataBind = "simpleLookup: "+value.lookup;
     }else if(value.checkbox){
       dataBind = "checked: "+value.checkbox;
       link = jQuery("<input type='checkbox' class='no-margin'></input>");
     }else if(value.date){
       dataBind = "value: "+value.date;
       link.attr("data-type","date");
       link.attr("data-mode","popover");
       link.attr("data-placement","bottom");
     }else if(value.textarea){
       dataBind = "value: "+value.textarea;
       link.attr("data-type","textarea");
     }else if(value.html){
       if(value.readOnly)
         link = jQuery("<span></span>");
       dataBind="html: "+value.html;
     }


     //if(value.readOnly !== undefined && value.readOnly)
       //editableOptions['disabled'] = true;
     
     if(value.options)
       dataBind = dataBind+", "+value.options;

     //if(! value.lookup) //lookkups have their own editableOptions already defined, so don't define a new one
       //dataBind = dataBind+", editableOptions: "+JSON.stringify(editableOptions);
     
     link.attr("data-bind",dataBind);
     formGroup = jQuery("<div class='form-group no-margin'></div>").append(label,separator,link);
     if(value.append)
       formGroup.append(value.append);
     jQuery(element).append(formGroup);
  },

}

ko.bindingHandlers.fadeVisible = {
    init: function(element, valueAccessor) {
        // Initially set the element to be instantly visible/hidden depending on the value
        var value = valueAccessor();
        jQuery(element).toggle(ko.unwrap(value)); // Use "unwrapObservable" so we can handle values that may or may not be observable
    },
    update: function(element, valueAccessor) {
        // Whenever the value subsequently changes, slowly fade the element in or out
        var value = valueAccessor();
        ko.unwrap(value) ? jQuery(element).fadeIn() : jQuery(element).fadeOut();
    }
};

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
        //console.log("selectize updating");

        var $element = jQuery(element);
        var allBindings = allBindingsAccessor();
        var selectizeOptions = allBindings.selectizeOptions || {};
        var control = $element[0].selectize;
        var value = ko.unwrap(valueAccessor());

        //we need to prevent changes made here from triggering another update back
        //to the ko observalble. So the onChange callback on this selectize
        //will check for this value and not update anything if it is true.
        if(selectizeOptions.onObsUpdate != null){
          jQuery.data(element,"selectizeUpdating",true);
          selectizeOptions.onObsUpdate(control,value);
          jQuery.data(element,"selectizeUpdating",false);
        }
    }
  }




ko.bindingHandlers.selectize_mess = {
    init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
      // This will be called when the binding is first applied to an element
      // Set up any initial state, event handlers, etc. here

      //console.log("selectize init");
      var $element = jQuery(element);
      var value = valueAccessor();
      var allBindings = allBindingsAccessor();
      var mode = allBindings.selectizeMode || "default";
      var selectizeOptions = allBindings.selectizeOptions || {};
      var keyField = selectizeOptions.labelField || "key";
      var valueField = selectizeOptions.valueField || "value";
      var api;
      var optionsObs;

      //console.log("selectize value: ",value());

      jQuery.data(element,"selectizeUpdating",false);

      var changeFn;
      var defaultOptions;
      var initialItems=[];
      var initialOptions=[];

      if(mode === "simple")
        changeFn = function(changedValue){
           //console.log("!! new simple selectize value: ",changedValue);
           if( changedValue && value() !== changedValue){
             value(changedValue.join(","));
           }
        }
      else
        changeFn = function(changedValue){
           //console.log("!! new selectize value: ",changedValue,$element);
           if(jQuery.data(element,"selectizeUpdating")){
             //console.log("update mode is true, not updating",changedValue);
             return;
           }
           if( value() !== changedValue){
             //console.log("changing value ",value(),changedValue);
             value(changedValue);
           }
           else
             console.log("not updating: ",value(),changedValue);
         }

      if(value() != null && value() != "" && ! isInteger(value())){
        console.log("selectize initial value: ",value());
        if(ko.isObservableArray(value))
          initialItems = value();
        else
          initialItems = String(value()).split(",");
         console.log("initalItems: ",initialItems);
         initialOptions = initialItems.map(function(item){
            newOption = {};
            newOption[keyField] = item;
            newOption[valueField] = item;
            return newOption;
         });
      }

      //console.log("initial value: ",value(),initialItems);
      defaultOptions = {
        create: true,
        createOnBlur: true,
        valueField: "key",
        labelField: "value",
        closeAfterSelect: true,
        items: initialItems,
        options: initialOptions,
        onChange: changeFn,
        plugins:['remove_button'],
      };
      if(selectizeOptions.options){
        optionsObs = selectizeOptions.options ;
        selectizeOptions.options = ko.utils.unwrapObservable(selectizeOptions.options);
      }

      var finalOptions = jQuery.extend(defaultOptions,selectizeOptions);
      console.log("final selectize options: ",finalOptions);
      $element.selectize(finalOptions);

      selectizeOptions.api = $element[0].selectize

      if(optionsObs && ko.isObservable(optionsObs) && mode === "fixedOptions"){
        optionsObs.subscribe(function(newValue){
          if(newValue != null){
            //console.log("setting new selectize options");
            api= $element[0].selectize;
            api.clearOptions(true);
            api.addOption(newValue);
            api.refreshOptions(false);

            //value may have referred to an option that was not present
            //until these options updated. so pretend like we just now set the 
            //value so that it can select from the newly updated options.
            value.valueHasMutated(); 
          }
        });

      }
     },
    update: function(element, valueAccessor, allBindingsAccessor,viewModel, bindingContext) {
      // This will be called once when the binding is first applied to an element,
      // and again whenever any observables/computeds that are accessed change
      // Update the DOM element based on the supplied values here.
      //console.log("selectize updating");

      var $element = jQuery(element);
      var allBindings = allBindingsAccessor();
      var selectizeOptions = allBindings.selectizeOptions || {};
      var mode = allBindings.selectizeMode || "default";
      var control = $element[0].selectize;
      var value = ko.unwrap(valueAccessor());
      var keyField = selectizeOptions.labelField || "key";
      var valueField = selectizeOptions.valueField || "value";
      var newOption;

      //we need to prevent changes made here from triggering another update back
      //to the ko observalble. So the onChange callback on this selectize
      //will check for this value and not update anything if it is true.
      jQuery.data(element,"selectizeUpdating",true);

      //console.log("updating selectize value to: '"+value+"'",$element);
      if(mode==="multiselect"){
        //this mode is useful for dealing with the final selection as a comma
        // separated string. 

        //console.log("selected items: ",control.items);
        if(value === null || value === undefined || value === ""){
          control.clearOptions();
          control.clear(true);
        }else{
          var items = value.indexOf(",") === -1 ? [value] : value.split(",");
          for( i in items){
            //console.log("adding item ",items[i]);
            newOption = {};
            newOption[keyField] = items[i];
            newOption[valueField] = items[i];
            control.addOption(newOption);
            control.addItem(items[i],true);
          }
        }
        control.refreshOptions(false);
        control.refreshItems();
        //console.log("new selected items: ",control.items);
      }else if(mode === "simple" || mode==="fixedOptions"){
        //console.log("value: ",value);
        if(value != null){
          var items;
          value = String(value);
          items = value.indexOf(",") === -1 ? [value] : value.split(",");
          for( i in items)
            control.addItem(items[i],true);
          control.refreshItems();
        }
      }else if(mode==="initialOnly"){
        // in this mode, only the initial value of the observable is used to add selected
        // items. After that, changes are intercepted by the callbacks given to in the
        // selectize configuration.
      }else{ // mode === "default"
        console.log("selectize options (default mode)",selectizeOptions.options());

        if(selectizeOptions.options && selectizeOptions.options()){
          control.clearOptions(true);
          control.addOption(selectizeOptions.options());
          control.refreshOptions(false);
        }

        //if(value === null || value === undefined || value === ""){
        if(value === null || value === undefined){
          control.clearOptions();
          control.clear(true);
        }else if(value !== 0 && value !== ""){ //make sure our value is one of the options.
          //in some cases, the values is really a key. Eg, when it is loaded from a key field
          //in the database. So if a function is provided to map back to values, and the
          //supposed 'value' is an integer, we assume it is really a key, and fetch the 
          //'real' string value to add as an option.
          if(selectizeOptions.keyToOption && isInteger(value)){
            selectizeOptions.keyToOption(value).
              then(function(option){
                //console.log("new option from key: ",option);
                control.addOption(option);
                control.addItem(option.key,true);
              });
          }else{
            newOption = {};
            newOption[keyField] = value;
            newOption[valueField] = value;
            control.addOption(newOption);
            control.addItem(value,true);
          }

        }
      }
      jQuery.data(element,"selectizeUpdating",false);
    }

}
 //make sure that any dependant observalbles are 
//fetched inside the getDataFn function
function defineLookup(context,getDataFn){
  console.log("defining lookup",context);
  var lookup = ko.computed(function(){
      return getDataFn();
    },context).extend({async:  []});
  
  //don't trigger reloads from lookup tables
  lookup.watch(false);
  console.log("lookup result: ",lookup());
  return lookup;
}
function tweakOptionsForSelect(item){
  return {
            value: item.key,
            text: item.value
         };
}
function tweakOptionsForSelectize(item){
  //console.log("selectize tweak: ",item);
  return {
              key: item.value,
              value: item.value
           };
}
function ObjectToOptionsForSelectize(object){
  return Object.getOwnPropertyNames(object).map(function(fieldName){
    return {
      key: object[fieldName],
      value: fieldName
    };
  });
}
function ObjectToOptionsForSelect(object){
  return Object.getOwnPropertyNames(object).map(function(fieldName){
    return {
      text: object[fieldName],
      value: fieldName
    };
  });
}
if(window.morf === undefined)
  window.morf={};
window.morf.sharedLookups={};

ko.bindingHandlers.defineLookup= {
    init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
      console.log("in defineLookup. config: ",bindingContext.$data._beanConfig);

      var value = ko.unwrap(valueAccessor());
      var vm = bindingContext.$data;
      var config;
      var loadLookup;
      var base;
                 
      config = vm._beanConfig || allBindingsAccessor.get("lookupConfig");
      base = (config && ( config.selectBaseUrl || config.baseUrl)) ||  ".";

      //console.log("value: ",value);
      //console.log("endpoint: ",value.endpoint);

      if(!config){
        console.log("no _beanConfig set for 'defineLookup' in ",vm,element);
        return;
      }

      loadLookup = function(){

        //console.log("config key field: "+config.keyField+", lookupPrimaryKey: "+value.lookupPrimaryKey);
        //console.log("vm: ",vm);
          var primaryKeyName = value.lookupPrimaryKey || (config && config.keyField);
          var primaryKey = primaryKeyName &&  vm[primaryKeyName]();
          var pkValue = primaryKey !== undefined ? primaryKey: "";
          var url = base+"/"+value.endpoint.replace("%PK%",pkValue);
          url = url.replace(/\/$/,""); //remove any trainling slash
          //console.log("final lookup url: ",url);

          if(value.selectType === "select")
            return fetchJSON(url,config.errorId,function(result){
              console.log("got result from "+url,result);
              if(result !=null && !jQuery.isArray(result) && typeof result === 'object')
                return ObjectToOptionsForSelect(result);
              else
                return result.map(tweakOptionsForSelect);
            });
          else
            return fetchJSON(url,config.errorId,function(result){

              if(result !=null && !jQuery.isArray(result) && typeof result === 'object'){ 
                return ObjectToOptionsForSelectize(result);
              }else{
                return result.map(tweakOptionsForSelectize);
              }
            });
      };

      // if endpoint contains %PK%, then lookup is key specific
      if( vm[value.varName+"_options"] === undefined &&  value.endpoint.indexOf("%PK%") !== -1 ){
        console.log("found %PK% in endpoint, fetching specific lookups");
        vm[value.varName+"_options"]=defineLookup(vm,loadLookup);
      }else {
        console.log("non key specific");
        //if it can be shared (not key specific), only fetch it once and store it globally
        if(window.morf.sharedLookups[value.varName] === undefined || 
            window.morf.sharedLookups[value.varName]() === null){
          console.log("defining new lookup options for "+value.varName); 
          window.morf.sharedLookups[value.varName] = defineLookup({},loadLookup);
        }//else console.log(value.varName+" options already defined");

        //then copy the options into the local viewModel (vm) for use.
        vm[value.varName+"_options"]=window.morf.sharedLookups[value.varName];
      }
    },
    update: function(element, valueAccessor, allBindingsAccessor,viewModel, bindingContext) {
    }
}

ko.bindingHandlers.selectLookup={
    preprocess: function(val,name,addBinding){
      //console.log("preprocessing selectLookup:",val);
      var values  = val.split(" ");
      var varName = values[0];
      var optionsName = values[0]+"_options";
      var endpoint = values[1] || "select/"+varName+"/%PK%";
      var selectType = values[3] || "selectize"

     
      addBinding("defineLookup",
        JSON.stringify({varName: varName,endpoint: endpoint, 
          lookupPrimaryKey:values[2],selectType: selectType}));

      if(selectType === "selectize"){
        addBinding("selectize",varName);
        addBinding("selectizeOptions","{options:"+optionsName+" }");
      }
      return "";
    }
  };


// incomplete, not sure if its needed
//ko.bindingHandlers.genericTableLookup={ 
//  preprocess: function(val,name,addBinding){
//
//    var schema;
//    var table;
//    var keyField;
//    var textField;
//    var endpoint;
//    var fields= val.split(":");
//    var keyParts;
//
//    if(fields.length > 1)
//      keyParts = fields[0].split(".");
//
//    if(fields.length !== 2 || keyParts.length !== 3){
//      console.error("value for 'genericTableLookup' must be of the form 'schema.table.keyField:textField', found ",val);
//      return "";
//    }
//
//    schema = keyParts[0];
//    table = keyParts[1];
//    keyField = keyParts[2];
//    textField = fields[1];
//
//    varName = json.varName || varName;
//    endpoint = json.endpoint || endpoint;
//    //console.log("varName: "+varName+", endpoint: "+endpoint);
//
//    addBinding("defineLookup", JSON.stringify({varName: varName, endpoint: endpoint, selectType: "select"}));
//    addBinding("editable",varName);
//    addBinding("editableOptions","{type:'select', source:"+varName+"_options, showbuttons: false }");
//    return "";
//  }
//}
ko.bindingHandlers.simpleLookup={ 
  preprocess: function(val,name,addBinding){

    //TODO: passing JSON as val requires using '&quot;' around all field names
    //and string values, which is not so great. Find a better way!

    var json;
    var varName=val;
    var endpoint = "select/"+val;

    if(isJson(val)){
      //console.log("JSON value given");
      json = JSON.parse(val);
      //console.log("Parsed JSON: ",json);
      varName = json.varName || varName;
      endpoint = json.endpoint || endpoint;
    }
    //console.log("varName: "+varName+", endpoint: "+endpoint);

    addBinding("defineLookup", JSON.stringify({varName: varName, endpoint: endpoint, selectType: "select"}));
    addBinding("editable",varName);
    addBinding("editableOptions","{type:'select', source:"+varName+"_options, showbuttons: false }");
    return "";
  }
}
ko.bindingHandlers.beanReadOnlyLookup={ 
  preprocess: function(val,name,addBinding){
    addBinding("defineLookup", JSON.stringify({varName: val, endpoint: "select/"+val, selectType: "select"}));
    addBinding("readOnlyLookupOptions",val+"_options");
    return val;
  },
  update: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
      var $element = jQuery(element);
      var value = valueAccessor();
      var options= allBindingsAccessor.get('readOnlyLookupOptions')();

      for(i in options){
        if(options[i].value === value()+""){
          $element.text(options[i].text);
          break;
        }
      }
  }
}
ko.bindingHandlers.readOnlyLookup={ 
  update: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
      var $element = jQuery(element);
      var value = ko.unwrap(valueAccessor());
      var options= ko.unwrap(allBindingsAccessor.get('readOnlyLookupOptions'));
      var selectOptions = ko.unwrap(options.options);
      var valueField = options.valueField || "value";
      var textField = options.textField || "text";

      //console.log("lookup options: ",selectOptions);
      //console.log("lookup value: ",value);

      if(selectOptions != null && Array.isArray(selectOptions)){
        for(i in selectOptions){
          if(selectOptions[i][valueField]== value){ //match string or numbers
            $element.text(selectOptions[i][textField]);
            break;
          }
        }
      }else if(selectOptions !=null && typeof selectOptions === 'object'){ 
        $element.text(selectOptions[value]);
      }else{
        console.log("WARNING, readOnlyLookup failed to recognize type of select options: ",typeof selectOptions);
      }
  }
}

ko.bindingHandlers.typeahead= {
    init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
      var $element = jQuery(element);
      var value = valueAccessor();
      var allBindings = allBindingsAccessor();
      var typeaheadOptions = ko.unwrap(allBindings.typeaheadOptions) || {};
      var defaultOptions;
      var finalOptions;

      defaultOptions = {
        limit: 200,
        classNames:{
          input: "form-control",
        },
        template: function(item){
          return item.value;
        },
      };

      finalOptions = jQuery.extend(defaultOptions,typeaheadOptions);
      //console.log("final typeahead options: ",finalOptions);

      $element.typeahead(finalOptions);
      $element.on('typeahead:selected',
       function(event,datum){
          console.log("selected",event,datum);
          value(datum);
        });
    
    },
    update: function(element, valueAccessor, allBindingsAccessor,viewModel, bindingContext) {
    }
}

function toggleBoolean(observable){
  //console.log("toggling boolean. current value: ",observable());
  observable(!observable());
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
function searchTable(schema,table,parentKeyField,childKeyField,parentKeyValue,observableOrFn,otherOptions={}){
  return fetchJSON("/morf/TableFeeds/"+schema+"/"+table+"/searchby/"+parentKeyField+"/"+parentKeyValue,"",
      function(results){
        var beanConfig = generateBeanConfig(childKeyField,schema,table,observableOrFn,otherOptions);
        //console.log("bean config for "+table+": ",beanConfig);
        //console.log(table+" results: ",results);
        return results.map(function(record){
          return new BeanForm(beanConfig,record);
        });
      });
}

function fetchTableData(schema,table,parentKeyField,childKeyField,parentKeyValue,observableOrFn,otherOptions={}){
  return fetchJSON("/morf/TableFeeds/"+schema+"/"+table+"/by/"+parentKeyField+"/"+parentKeyValue,"",
      function(results){
        var beanConfig = generateBeanConfig(childKeyField,schema,table,observableOrFn,otherOptions);
        //console.log("bean config for "+table+": ",beanConfig);
        //console.log(table+" results: ",results);
        return results.map(function(record){
          return new BeanForm(beanConfig,record);
        });
      });
}
function generateBeanConfig(key,schema,table,observableOrFn,otherOptions={}) {
  return jQuery.extend(otherOptions,{ 
    keyField: key,
    bindElementId:"nobind",
    baseUrl: "/morf/TableFeeds/"+schema+"/"+table+"/by/"+key,
    selectBaseUrl: "/morf/TableFeeds/"+schema+"/"+table,
    customize: function(vm){
      //console.log("adding vm: ",vm);
      if(ko.isObservable(observableOrFn))
        observableOrFn.push(vm); 
      else if(typeof observableOrFn === "function")
        observableOrFn(vm);
    }
  });
}

function linkParts(urlBase,parentBean, childPN,linkType="simple_links", linkValue=""){
  var parentVM = parentBean.getVM();
  if(parentVM != null){ //we have a  parent
    if(parentVM.partNumber()){ // the parent has been saved, so  has a part number
      console.log("linking child "+childPN+" to parent "+parentVM.partNumber());
      fetchJSON(urlBase+"/PartType/link/"+linkType+"/"+parentVM.partNumber()+ "/"+childPN+"/"+linkValue);
    }
    else { // header not saved yet
      console.log("no part number for header set, trying to save it now");
      parentBean.save().then(function(){
        // see if it has a part number now
        if(parentVM.partNumber()){
          console.log("saved parent VM, linking child");
          fetchJSON(urlBase+"/PartType/link/"+linkType+"/"+parentVM.partNumber()+ "/"+childPN+"/"+linkValue);
        }else{
          console.log("failed to save parent VM to get part number, cannot link child yet");
          setErrorString("failed to save record, could not save containing record.");
        }
      });
    }
  }else
    setErrorString("failed to save record, no containing record present.");

}
function startSpinner(spinner){
  spinner.count(spinner.count()+1);
  //console.log("spinner START  -------------",spinner.count());
  spinner.loading(true);
}
function stopSpinner(spinner){
  spinner.count(spinner.count() - 1);
  //console.log("spinner STOP -------------",spinner.count());
  if(spinner.count() === 0){
    //console.log("final STOP -------------");
    spinner.loading(false);
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

