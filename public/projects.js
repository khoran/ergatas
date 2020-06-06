var viewModel;
var player;

jQuery(document).ready(function() { recordingProjectsInit(); });

function recordingProjectsInit(){

  alertify.set('notifier','position', 'top-right');
  alertify.dialog("recordFeedback",function(){},true,'prompt');

  var storageKey="recording_projects";
  var storage = window.localStorage;

  if(usingInternetExplorer())
    return;

  if(typeof(Storage) === "undefined" ){
    alertify.alert("Your browser doesn't seem to support local storage, "+
        "which is a requirement to use this page. Please upgrade your browser");
    return;
  }

  viewModel = {
    displayMode: ko.observable("list"),
    online: ko.observable(true),

    projectSummaries: ko.observableArray(),
    currentProject: ko.observable(),
    cachedProjects: ko.observableArray(), //not always a complete list of all projects

    currentLIF: ko.observable(),
    currentTrip: ko.observable(),

    displayMap: ko.observable(false),


    selectProject: function(projectSummary){
      //load project based on recordingProjectKey
      // store in 'currentProject'
      var project = viewModel.cachedProjects().filter(
          function(p){
            return p.recordingProjectKey() === projectSummary.recordingProjectKey();
          })[0];
      if(project != null){
        viewModel.currentProject(project);
        viewModel.displayMode("project");
      }else if(viewModel.online()){
        //try to load from server if online
      }
    },
    selectLIF: function(lif){
      viewModel.currentLIF(lif);
      viewModel.displayMode("lif");
    },
    selectTrip: function(trip){
      viewModel.currentTrip(trip);
      viewModel.displayMode("trip");
    },
    showMap: function(elementId,vm){
      console.log("showing map",vm);
      var centerOfMap = new google.maps.LatLng(vm.lattitude(), vm.longitude());
      var options = {
        center: centerOfMap, //Set center.
        zoom: 7 //The zoom value.
      };
      var map = new google.maps.Map(jQuery('#'+elementId)[0], options);
      var marker;
      var recordLocation = function(){
        console.log("recording location ",marker.getPosition());
        vm.lattitude(marker.getPosition().lat());
        vm.longitude(marker.getPosition().lng());
      }
      viewModel.displayMap(true);
   
      //Listen for any clicks on the map.
      google.maps.event.addListener(map, 'click', function(event) {                
          console.log("click on map");
          //Get the location that the user clicked.
          var clickedLocation = event.latLng;
          console.log("click envent ",clickedLocation);
          //If the marker hasn't been added.
          if(marker == null){
              //Create the marker.
              marker = new google.maps.Marker({
                  position: clickedLocation,
                  map: map,
                  draggable: true //make it draggable
              });
              //Listen for drag events!
              google.maps.event.addListener(marker, 'dragend', function(event){
                recordLocation();
              });
          } else{
              //Marker has already been added, so just change its location.
              marker.setPosition(clickedLocation);
          }
          recordLocation();
      });
    },
    createProject: function(){

      alertify.prompt("New Project","Project Name","",
          function(event,value){
            var testingKey = Math.floor(Math.random() * 1000);
            var projectSummary = {
              recordingProjectKey: ko.observable(testingKey),
              name:  ko.observable(value)
            };
            var project = jQuery.extend({},
                  projectSummary,{
                    languageNumber: ko.observable(),
                    languageName: ko.observable(),
                    locationKey: ko.observable(),
                    locationName: ko.observable(),
                    lattitude: ko.observable(),
                    longitude: ko.observable(),
                    //currentStep: ko.observable(1),
                    lifs: ko.observableArray(),
                    prps: ko.observableArray(),
                    trips: ko.observableArray(),
                    feedback: ko.observableArray([]),

                });
            project.currentStep = ko.computed(function(){
                      console.log("updating step");
                      //important to access all observables here for 
                      //correct dependancy tracking.
                      var numLifs = project.lifs().length;
                      var numPrps = project.prps().length;
                      var numTrips = project.trips().length;

                      if(numLifs === 0)
                        return 1;

                      if(numLifs > 0 && numPrps === 0 && numTrips === 0)
                        return 2;

                      if(numPrps > 0 && numTrips === 0)
                        return 3;

                      if(numTrips > 0)
                        return 4;
                      //console.log("final step value; ",project.currentStep());

                    });

            viewModel.projectSummaries.push(projectSummary);
            viewModel.cachedProjects.push(project);
            viewModel.selectProject(projectSummary);
          },
          function(){});
      /*
      var content = jQuery("#new-project-template").clone()[0];

      alertify.formDialog(content,
          {languageNumber: ko.observable(),
            languageName: ko.observable(),
            locationKey: ko.observable(),
            locationName: ko.observable()},
          function(vm){
            console.log("value: ",vm);
            vm.recordingProjectKey = ko.observable(3);
            vm.status = ko.observable('new');
            viewModel.projectSummaries.push(vm);
            viewModel.cachedProjects.push(
                jQuery.extend({},vm, {
              lifs: ko.observableArray(),
              prps: ko.observableArray(),
              trips: ko.observableArray(),
            }));

          }).set("overflow",false).
          resizeTo("30%","80%");
          */

    },
    createLIF: function(project){
      console.log("creating LIF: ",project);
      var lif = {
        //partNumber: ko.observable(4316555),
        //partName: ko.observable('sample LIF'),
        partNumber: ko.observable(),
        partName: ko.observable(),
      };

      project.lifs.push(lif);
      viewModel.selectLIF(lif);
    },
    uploadLIF: function(project){
      //use fineUploader to upload LIF form
      console.log("Uploading LIF form");
      project.lifs.push({filename: "lif filename"});
    },
    uploadFeedback: function(project){
      console.log("Uploading feedback");
      project.feedback.push({filename: "feedback filename"});
    },
    recordVideo: function(project){
      var content;
      content = jQuery( "<record-feedback params=''></record-feedback>")[0];

      vm = {
      };
      ko.applyBindings(vm,content);

      alertify.recordFeedback("").set({
        //labels: {
          //ok: "Rename",
        //},
        transition: "zoom",
        title: "Record Feedback",
        onok: function(){
          console.log("closing feedback dialog");
          this.destroy();
        },
        oncancel: function(){
          console.log("closing feedback dialog");
          this.destroy();
        },
      }).
      setContent(content).
      resizeTo("50%","80%");

    },
    deleteFeedback: function(feedback,project){
      alertify.confirm("Delete Feedback","Delete '"+feedback.filename()+"'?",
          function(){
            project.feedback.remove(feedback);
          },function(){});
    },
    deleteLIF: function(lif,project){
      alertify.confirm("Delete LIF",
          "Delete "+lif.partName()+"( "+lif.partNumber()+") ?",
          function(){
            if(lif.partNumber() != null ) //has been saved to db 
              fetchJSON("../PartType/delete/"+lif.partNumber()+"?unlinkParents=true","",
                  function(){
                    project.lifs.remove(lif);
                  });
            else
              project.lifs.remove(lif);
          },function(){});
    },
    deleteTrip: function(trip,project){
      alertify.confirm("Delete Trip",
          "Delete "+trip.name()+"?",
          function(){
            if(trip.recordingTripKey() != null ) //has been saved to db 
              //fetchJSON("../PartType/delete/"+lif.partNumber()+"?unlinkParents=true","",
                  //function(){
                    //project.lifs.remove(lif);
                  //});
              project.trips.remove(trip);
            else
              project.trips.remove(trip);
          },function(){});

    },
    createPRP: function(project){
      project.prps.push({
        prpId: ko.observable(0),
        name: ko.observable("sample PRP"),
      });
    },
    uploadPRP: function(project){
      console.log("Uploading a PRP");
    },
    createTrip: function(project){
      alertify.prompt("New Trip","Trip Name","",
          function(event,value){
            var trip = {
              recordingTripKey: ko.observable(0),
              name: ko.observable(value),
              startDate: ko.observable(),
              endDate: ko.observable(),
              locationKey: ko.observable(),
              locationName: ko.observable(),
              longitude: ko.observable(),
              lattitude: ko.observable(),
              status: ko.observable("pending"),
              cost: ko.observable(),
              costDescription: ko.observable(),
              extraCost: ko.observable(),
              extraCostDescription: ko.observable(),
              description: ko.observable(),
            };
            project.trips.push(trip);
            viewModel.selectTrip(trip);
          },
          function(){});


    },
  };

  viewModel.save=function(){
    console.log("saving form...");
    var js = ko.mapping.toJS(viewModel);
    var json = JSON.stringify(js,
        function(k, v) { return v === undefined ? null : v; });
    //console.log("js version: ",json);
    storage.setItem(storageKey,json);
  }
  viewModel.haveSavedData= function(){
    return storage.getItem(storageKey) !== null;
  }
  viewModel.load = function(){
    console.log("loading saved data");

    var js =   storage.getItem(storageKey);
    var data=JSON.parse(js);
    //console.log("found saved js: ",data);
    ko.mapping.fromJS(data,{},viewModel);
    //console.log("viewModel after load: ",viewModel.projects());
  }
  viewModel.clearStorage = function(){
    storage.removeItem(storageKey);
  }
  
  if(viewModel.haveSavedData())
    viewModel.load();

  ko.watch(viewModel,{depth: -1},function(parents,child,item){
    console.log("item changed",child());
    viewModel.save();
  });


  ko.applyBindings(viewModel);


  //video = document.querySelector('video');
  //navigator.mediaDevices.getUserMedia({video:true,audio:true}).
  //  then(function(stream){
  //    video.srcObject = stream;
  //  });
  
//  player = videojs('myVideo', {
//      // video.js options
//      controls: true,
//      loop: false,
//      fluid: false,
//      width: 320,
//      height: 240,
//      plugins: {
//          // videojs-record plugin options
//          record: {
//              image: false,
//              audio: true,
//              video: true,
//              maxLength: 300,
//              debug: true
//          }
//      }
//  });
//  player.on('finishRecord',function(){
//    console.log("Rcording Stopped!");
//    console.log("recorded data: ",player.recordedData);
//    player.record().saveAs();
//  });
 


}
 
