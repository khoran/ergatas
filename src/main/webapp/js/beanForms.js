
/*
 * requred args: 
 *  keyField: the name of the primary key in the database table
 *  baseUrl: the path to the server endpoint
 *
 * optional args:
 *  errorId: the id of an HTML element where errors should be posted
 *  noAutoReload: boolean or array. If true, don't save and reload the form on every change.
 *                   if an array, values should be field names to exclude from auto reloading. 
 *  customize: function args (viewmodel). called when viewmodel is initalized.
 *  bindElementId: bind knockout to only the element with the given ID.
 *  saveUrlParameters: parameters to add to end of URL used for saving
 *  loadUrlParameters: parameters to add to end of URL used for loading
 *  selectBaseUrl: a different base URL to use for lookups
 *  onReloadStart: a function called when starting to reload
 *  onReloadDone: a function called when reloading is done
 *  preSaveFilter: a function called on the VM just before saving. The return value will be 
 *                 sent to the server, but will not modify the local VM. 
 *
 *
 * URL patterns used to modify objects:
 * GET baseUrl/            fetch new object
 * GET baseUrl/<key>       load existing object by key
 * POST baseUrl/           insert new record
 * POST baseUrl/<key>      update existing object by key
 * DELETE baseUrl/<key>    delete object by key
 *
 *
 */
function BeanForm(config,initialValue){

  var formVM;
  //var keyField;
  var inReload=ko.observable(false);

  //false until first form loaded and initial binding done,
  // then reset to true to avoid repeating binding call
  var doneBinding = false; 

  var requiredFields = ["keyField","baseUrl" ];

 	jQuery.fn.editable.defaults.mode = 'inline';

  for(field in requiredFields){
  if(!config[requiredFields[field]])
    throw "config field '"+requiredFields[field]+"' required";
  }
  if(!config.errorId) 
    config.errorId=""

  inReload.subscribe(function(newValue){
    if(config.onReloadStart && newValue === true){
      console.log("starting reload");
      config.onReloadStart();
    }
    if(config.onReloadDone && newValue === false){
      console.log("reload done");
      config.onReloadDone();
    }

  });


  if(initialValue)
    setInitialData(ko.mapping.toJS(initialValue));

///////////////////// PRIVATE //////////////
  
  //allowKeylessSave: if true, allow objects with no key value
  //                  defined to be sent to the server as a new object.
  function reloadModel(allowKeylessSave){
    var f;
    var finalVMToSave;


    //TODO: Problem, if two or more changes are made to a bean quickly, 
    //the following code will cause subsequent changes to be thrown away.
    //FIX IT!
    if(inReload()){
      console.log("WARNING: skipping reload request, already reloading");
      return;
    }
    inReload(true);
    console.log("reloading form");
    if(allowKeylessSave || formVM[config.keyField]() !== 'undefined'){

      //this is a promise that will not be resolved until both 
      //sendDataToServer and loadDataFromServer have finished
      f = jQuery.Deferred();

      if(config.preSaveFilter !== undefined)
        finalVMToSave = config.preSaveFilter(formVM);
      else 
        finalVMToSave = formVM;

      sendDataToServer(ko.mapping.toJS(finalVMToSave)).
        always(function(){
            console.log("in always function");
            loadDataFromServer(formVM[config.keyField](),function(data){
              console.log("rebinding with new. ",data);
              ko.mapping.fromJS(data,formVM);
              f.resolve();
            }).fail(function(){
              console.log("loadDataFromServer failed, rejecting shared promise");
              f.reject();
            }).always(function(){
               inReload(false);
             });
        }).fail(function(){
          console.log("sendDataToServer failed, rejecting shared promise");
          f.reject();
        });    
      return f;
    }else  //just to make things chainable. Any .then()'s will happen immediatly
      return jQuery.Deferred().resolve(); 
  }
  /* load data from server without saving current data */
  function refresh(){
    if(formVM[config.keyField]() !== 'undefined'){
      return loadDataFromServer(formVM[config.keyField](),function(data){
          console.log("rebinding with new. ",data);
          ko.mapping.fromJS(data,formVM);
        }).fail(function(){
          console.log("refresh failed");
        });
    }else{
      return jQuery.Deferred().reject("attempt to refresh a bean with no key set");
    }
  }

  function loadDataFromServer(key,successFn){


    var url = config.baseUrl;

    if(key !== undefined && key !== '')
      url = url+"/" + key;

    if(config.loadUrlParameters)
      url = url+"?"+config.loadUrlParameters;

    //console.log("loading data from server",key,url);
    inReload(true);
    return jQuery.getJSON(url).
      then(function(result){
          //console.log("ajax call returned with ",result);
          if(isError(result)){
            setJsonError(config.errorId,result);
            return jQuery.Deferred().reject(); //prevent success chaining
          }
          else if(successFn){
            successFn(result);
            inReload(false);
          }
        },
        function(){
            setJsonError(config.errorId,
              {error:"failed to fetch record "+key+" from server"});

        });
  }

  function haveKeyValue(data){
    return data[config.keyField] !== undefined && data[config.keyField] !== '';
  }
  function sendDataToServer(data){
    console.log("sending data to server",data);
    var url = config.baseUrl;
    
    if(haveKeyValue(data))
      url = url +"/"+data[config.keyField];

    if(config.saveUrlParameters)
      url = url+"?"+config.saveUrlParameters;

    console.log("send to server URL: ",url);
    return jQuery.ajax(url,
        {
          type: "POST",
           contentType: "application/json",
           data:JSON.stringify(data),
           dataType:"json",
        }).
      then(function(result){
          //console.log("post succeded. result: ",result);
          if(isError(result)){
            setJsonError(config.errorId,result);
            return jQuery.Deferred().reject(); //prevent future chaining even though this looks like a success
          }
          else if(!haveKeyValue(data) && jQuery.isNumeric(result)) //expect a key value back
            formVM[config.keyField](result);
        },
        function(){
          setJsonError(config.errorId,
              {error:"failed to save record"});
        })
  }
 
  //make sure that any dependant observalbles are 
  //fetched inside the getDataFn function
  function defineLookup(name,getDataFn){
    //console.log("defining lookup",name,config.bindElementId,formVM);
    formVM[name] = ko.computed(function(){
        return getDataFn();
      },formVM).extend({async:  []});
    
    //don't trigger reloads from lookup tables
    formVM[name].watch(false);
  }

  function setInitialData(data){
    if(formVM)
      ko.mapping.fromJS(data,formVM);
    else
      formVM = ko.mapping.fromJS(data);
    

    //stash the config here so we can accessing it in KO bindings
    formVM["_beanConfig"] = config;

    if(config.noAutoReload !== true){
      ko.watch(formVM,function(parents,child,item){
        //console.log("item changed",child(),formVM);
        reloadModel();
      });
    }

    if(config.noAutoReload && config.noAutoReload.constructor === Array){
      for(i in config.noAutoReload){
        //console.log("disabling auto reload for ",config.noAutoReload[i]);
        formVM[config.noAutoReload[i]].watch(false);
      }
    }

    if(config.customize)
      config.customize(formVM);


    if(!doneBinding){ // avoid a double bind!
      if(config.bindElementId !== "nobind"){
        console.log("BINDING ",config.bindElementId);
        if(config.bindElementId)
          ko.applyBindings(formVM,jQuery("#"+config.bindElementId)[0]);
        else
          ko.applyBindings(formVM);
      }
      doneBinding=true;
    }
    //console.log("done setting inital data");
  }



  //var updating=false;

  /////////////// PUBLIC API ///////////
  function load(key,resetExcludePattern){
    inReload(true); //don't trigger reloads when we clear the model
    //console.log("load: resetting view model. formVM = ",formVM);
    //console.log("load: config.keyField = ",config.keyField);
    resetViewModel(formVM,config.keyField,resetExcludePattern);
    inReload(false);
    return loadDataFromServer(key,setInitialData);
  }
  function getVM (){
    return formVM;
  }
  function handleError(response,newValue){
    var json =JSON.parse(response.responseText);
    if(isError(json))
      setJsonError(config.errorId,json);
    return  "Update failed";
  }
  function createNew(){
    //call load without key to fetch a new object from server
    return load(); 
  }
  function save(){
    console.log("manual save");
    return reloadModel(true);
  }
  function remove(){
    if(key !== undefined && key !== '')
      return ajaxDelete(config.baseUrl+"/"+key,errorId);
    else{
      console.log("tried to delete BeanForm with no key set");
      return null;
    }

  }
  function singleReload(f){
    var fx;
    inReload(true);
    fx=f();
    inReload(false);
    save();
    return fx;
  }



  return {
    load: load,
    createNew: createNew,
    getVM: getVM, //deprcated, used 'vm'
    vm: function(){return formVM;}, // replaces getVM
    handleError: handleError,
    save: save,
    remove: remove,
    refresh: refresh,
    singleReload: singleReload,


  };

}




