ko.components.loaders.unshift({
    loadTemplate: function(name, templateConfig, callback) {
        console.log("------------------ loading template ",name,templateConfig);
        if (templateConfig.fromUrl) {
            // Uses jQuery's ajax facility to load the markup from a file
            var fullUrl = '/morf/ko-components/' + templateConfig.fromUrl+".html";
            jQuery.ajax(fullUrl, {cache:false}).then(function(markupString) {
                // We need an array of DOM nodes, not a string.
                // We can use the default loader to convert to the
                // required format.
                console.log("got template: ",markupString);
                ko.components.defaultLoader.loadTemplate(name, markupString, callback);
            });
        } else {
            // Unrecognized config format. Let another loader handle it.
            callback(null);
        }
    }
});

ko.components.register('like-or-dislike', {
    //viewModel: function(params) {
    //    // Data: value is either null, 'like', or 'dislike'
    //    this.chosenValue = params.value;
    //     
    //    // Behaviors
    //    this.like = function() { this.chosenValue('like'); }.bind(this);
    //    this.dislike = function() { this.chosenValue('dislike'); }.bind(this);
    //},
    viewModel: {createViewModel: function(params){
        console.log("like-or-dislike creating view model");
        var vm = {};
        vm.chosenValue = params.value;
        vm.like = function() { vm.chosenValue('like'); }.bind(vm);
        vm.dislike = function() { vm.chosenValue('dislike'); }.bind(vm);
        return vm;
    }},
    template: {fromUrl: "like-widget"},
});

/*
 * params
 * ------
 *  - names: input data. should be objects like {id: <nodeId>, label: <display name>}
 *  - newNames: should be given an empty observable and will be populated with objects
 *              with new names.
 */
ko.components.register('rename-nodes', {
  viewModel: function(params){
    console.log("rename-nodes params: ",params);
    var vm = {
      names: ko.observableArray(params.names()),
      pattern: ko.observable(""),
      replacement: ko.observable(""),
    };
    vm.originalLabel= function(i){ 
      console.log("vm names: ",i,vm.names()[i]);
      return vm.names()[i].label; 
    };
    vm.computedNames = ko.pureComputed(function(){
      console.log("pure compute: ",vm);
      var regex = new RegExp(vm.pattern());
      var x=vm.names().map(function(name){
        return {
          id: name.id, 
          label:name.label.replace(regex,vm.replacement())};
      });
      if(params.newNames)
        params.newNames(x);
      return x;
    });
    return vm;
  },
  template:{fromUrl: "rename-nodes"},
});


/* params
 * -------
 * - options: object
 *   - fileTypeKeys: comma seperated string with key values
 *   - folderStructureKey: key for selected folder structure
 */
ko.components.register('media-item-options',{
  viewModel: function(params){
    var vm;
    var initialFolderStructureKey;
    //console.log("media-item-options params: ",params);
    //console.log("input folder structure key: ",params.options.folderStructureKey());
    if(params.options == null || params.options.fileTypeKeys == null || params.options.folderStructureKey == null){
      console.log("missing options. fileTypeKeys and folderStructureKey required");
      return {};
    }


    if(params.options != null && params.options.customPattern == null)
      params.options.customPattern = ko.observable("");

    if(params.options.folderStructureKey() == null)
      params.options.folderStructureKey("27")

    initialFolderStructureKey = params.options.folderStructureKey();

    vm={
      fileTypes: ko.observableArray(),
      folderStructures: ko.observableArray(),

      selectedFileTypeKey: params.options.fileTypeKeys,
      selectedFolderStructureKey: params.options.folderStructureKey,
      customPattern: params.options.customPattern,
    };
    console.log("INIT: selected folder key to ",params.options.folderStructureKey());

    fetchJSON("/morf/TableFeeds/orders/LookupOrderableFileTypes/all","",function(result){
      orderObjectsBy(result,"format");
      vm.fileTypes(result);
    })
    fetchJSON("/morf/TableFeeds/orders/LookupFolderStructures/all","",function(result){
      orderObjectsBy(result,"name");
      vm.folderStructures(result);
      //select here, after options have been loaded
      vm.selectedFolderStructureKey(initialFolderStructureKey);
    })


    return vm;
  },
  template:{fromUrl: "media-item-options"},
});

ko.components.register('program-selector',{
  template: {fromUrl: "program-selector"},
  viewModel:{createViewModel: function(params,componentInfo){
      console.log("program-selector, creating view model, params: ",params);

      var template = jQuery(componentInfo.element);

      var viewModel = {
        loadingCount: ko.observable(0),
        languageNumber: ko.observable(),
        locationKey: ko.observable(),
        programGroups: ko.observableArray(),
        selectedProgramGroup: ko.observable(-1),
        programTable: ko.observable(),
        fileTypes: ko.observableArray(),
        selectedFileTypes: ko.observable("20"),

        programMatches: ko.observableArray(),
        locations: ko.observable(),
        isoCode: ko.observable(),
        ratings: ko.observable(),

      }
      function startLoading(){
        viewModel.loadingCount(viewModel.loadingCount()+1);
      };
      function stopLoading(){
        viewModel.loadingCount(viewModel.loadingCount()-1);
      };
      function addToLoadingCount(value){

        //var currentValue = ko.ignoreDependencies("currentValue" , viewModel );
      }
      viewModel.fetchMatches= ko.computed(function(){
          console.log("fetching matches");
          console.log("lang num: ",viewModel.languageNumber());
          console.log("program type: ",viewModel.selectedProgramGroup());
          console.log("location key: ",viewModel.locationKey());
          console.log("iso code: ",viewModel.isoCode());

          var queryOptions=""
          if(viewModel.languageNumber() != null)
            queryOptions = queryOptions + "languageKey="+viewModel.languageNumber()+"&";
          if(viewModel.selectedProgramGroup() != null && viewModel.selectedProgramGroup() !== -1)
            queryOptions = queryOptions + "programGroupKey="+viewModel.selectedProgramGroup()+"&";
          if(viewModel.locationKey() != null)
            queryOptions = queryOptions + "locationKey="+viewModel.locationKey()+"&";
          if(viewModel.isoCode() != null && viewModel.isoCode() !== "")
            queryOptions = queryOptions + "isoCode="+viewModel.isoCode()+"&";

          ko.ignoreDependencies(startLoading);
          fetchJSON("/morf/RecordistTools/programSearch?"+queryOptions,"",function(results){
            console.log("match results: ",results);
            if(results.limited)
              alertify.warning("More than 1000 results were found, only the first 1000 are being shown");
            viewModel.programMatches(results.results);
          }).always(function(){ko.ignoreDependencies(stopLoading); });
        });

      startLoading();
      fetchJSON("/morf/TableFeeds/grid3/LookupProgramgroup/all","",function(result){
        orderObjectsBy(result,"programGroup");
        result.unshift({programGroup:"Any",programGroupKey: -1});
        viewModel.programGroups(result);
      }).always(stopLoading());
      startLoading();
      fetchJSON("/morf/TableFeeds/languages/Locations/lookup/locationKey/grnLocationName","",function(result){
        viewModel.locations(result);
        console.log("done loading locations",result);
      }).always(stopLoading());

      startLoading();
      fetchJSON("/morf/TableFeeds/orders/LookupOrderableFileTypes/all","",function(result){
        var defaultSelection;
        orderObjectsBy(result,"format");
        viewModel.fileTypes(result);
      }).always(stopLoading());

      languageInputSetup(template.find("#languageInput"),function(name, languageNumber){
        viewModel.languageNumber(languageNumber);
      });
      
      locationInputSetup(template.find("#locationInput"),function(name, locationKey){
        viewModel.locationKey(locationKey);
      });

      // define ratings lookup
      viewModel.ratings({
        "F":"Fair",
        "G":"Good",
        "H":"Hold",
        "N":"None",
        "P":"Poor",
        "U":"Unusable"});

      viewModel.programsTableOptions  = {
        select: true,
        init: viewModel.programTable,
        dom: 'Bflrtip',
        buttons: [
          'selectAll',
          'selectNone',
        ],
        columns: [ 
          {data: 'Program Set Number',      visible: false},
          {data: 'Program Number',   },
          {data: 'Language Number',  visible: false},
          {data: 'Language Name',   },
          {data: 'ISO Code',        },
          {data: 'Program Title',    },
          {data: 'Location',        },
          {data: 'Year',            },
          {data: 'Content Rating',  },
          {data: 'Technical Rating',},
        ]
      }

      //user passes in an empty observable as 'callback', then 
      //we set it to a callback function that can be used
      //to fetch the current selection.
      if(params.getCurrentSelection != null)
        params.getCurrentSelection( function(callback){
          var selectedRows;
          var programSetNumbers=[];
          if(viewModel.programTable() != null && callback){
            selectedRows = viewModel.programTable().rows(
                {selected: true}).data();
            console.log("selected rows: ",selectedRows);
            selectedRows.each(function(row) {
              programSetNumbers.push(jQuery(row["Program Set Number"]).text());

            });
            callback(programSetNumbers,viewModel.selectedFileTypes().split(","));
          }
        });

     
      return viewModel;
    }
  }
});


