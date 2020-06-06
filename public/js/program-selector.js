

function programSelectorInit(){
  var viewModel = {
    languageNumber: ko.observable(),
    locationKey: ko.observable(),
    programTypes: ko.observableArray(),
    selectedProgramType: ko.observable(-1),
    programTable: ko.observable(),
    fileTypes: ko.observableArray(),
    selectedFileTypes: ko.observable(),

    programMatches: ko.observableArray(),
    locations: ko.observable(),
    isoCode: ko.observable(),
    ratings: ko.observable(),


  }
  programSelectorVM= viewModel;
  viewModel.fetchMatches= ko.computed(function(){
      console.log("fetching matches");
      console.log("lang num: ",viewModel.languageNumber());
      console.log("program type: ",viewModel.selectedProgramType());
      console.log("location key: ",viewModel.locationKey());
      console.log("iso code: ",viewModel.isoCode());

      var queryOptions=""
      if(viewModel.languageNumber() != null)
        queryOptions = queryOptions + "languageKey="+viewModel.languageNumber()+"&";
      if(viewModel.selectedProgramType() != null && viewModel.selectedProgramType() !== -1)
        queryOptions = queryOptions + "programTypeKey="+viewModel.selectedProgramType()+"&";
      if(viewModel.locationKey() != null)
        queryOptions = queryOptions + "locationKey="+viewModel.locationKey()+"&";
      if(viewModel.isoCode() != null && viewModel.isoCode() !== "")
        queryOptions = queryOptions + "isoCode="+viewModel.isoCode()+"&";

      fetchJSON("../RecordistTools/programSearch?"+queryOptions,"",function(results){
        console.log("match results: ",results);
        if(results.limited)
          alertify.warning("More than 1000 results were found, only the first 1000 are being shown");
        viewModel.programMatches(results.results);
      });
    });

  fetchJSON("../TableFeeds/grain/ProgramTypes/all","",function(result){
    //result.sort(function(a,b){
      //if(a.programType < b.programType) return -1;
      //if(a.programType > b.programType) return 1;
      //return 0;
    //});
    orderObjectsBy(result,"programType");
    result.unshift({programType:"Any",programTypeKey: -1});
    viewModel.programTypes(result);
  });
  fetchJSON("../TableFeeds/languages/Locations/lookup/locationKey/grnLocationName","",function(result){
    viewModel.locations(result);
  });

  fetchJSON("../TableFeeds/orders/LookupOrderableFileTypes/all","",function(result){
    var defaultSelection;
    orderObjectsBy(result,"fileType");
    viewModel.fileTypes(result);

  });

  languageInputSetup("#languageInput",function(name, languageNumber){
    viewModel.languageNumber(languageNumber);
  });
  
  locationInputSetup("#locationInput",function(name, locationKey){
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

  //not used
  viewModel.programsTableOptions  = {
    select: true,
    init: viewModel.programTable,
    dom: 'Bflrtip',
    buttons: [
      'selectAll',
      'selectNone',
    ],
    columns: [ 
      {data: 'Program Key',      visible: false},
      {data: 'Program Number',   },
      {data: 'Language Number',  visible: false},
      {data: 'Language Name',   },
      {data: 'ISO Code',        },
      {data: 'Program Type',    },
      {data: 'Location',        },
      {data: 'Year',            },
      {data: 'Content Rating',  },
      {data: 'Technical Rating',},
    ]
  }

  alertify.programSelector || alertify.dialog("programSelector",function(){
    var selectProgramsFn;
    return {
      main:function(content,callback){
        this.setContent(content);
        if(viewModel.selectedFileTypes() == null)
          viewModel.selectedFileTypes("6");
        selectProgramsFn = callback;
      },
      setup:function(){
        return {
          buttons:[
            {
              text:"Select",
            },
            {
              text:"Cancel",
              invokeOnClose: true,
              className: alertify.defaults.theme.cancel,
            },
          ],
          options: {
            title: "Program Selector",
            //startMaximized: true,
            transition: "zoom",
          }

        };
      },
      callback: function(closeEvent){
        if(closeEvent.index === 0 ){ //select button clicked
          console.log("select button clicked");
          var selectedRows;
          var programKeys=[];
          if(viewModel.programTable() != null && selectProgramsFn){
            selectedRows = viewModel.programTable().rows(
                {selected: true}).data();
            //console.log("selected rows: ",selectedRows);
            selectedRows.each(function(row) {
              programKeys.push(jQuery(row["Program Number"]).text());

            });
            selectProgramsFn(programKeys,viewModel.selectedFileTypes().split(","));
          }else
            console.log("WARNING: no programTable value set, or no callback function set");
        }
      },
    };

  });
  
  ko.applyBindings(viewModel,jQuery("#programSelectorBindPoint")[0]);
}
