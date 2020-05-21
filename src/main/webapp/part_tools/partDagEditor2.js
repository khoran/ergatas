var viewModel;
jQuery(document).ready(function() { partDagEditorInit(); });

function partDagEditorInit(){

  var graph;
  var viewModel;
  var partNumberPar;

  //setup some dialog stuff
  alertify.set('notifier','delay', 30);
  alertify.set('prompt','transition', "zoom");

  alertify.dialog("selectNode",function(){},true,'prompt');
  alertify.dialog("renameNodes",function(){},true,'prompt');


  viewModel = {
    partTypes: ko.observableArray(),
    filter:ko.observable(),
    selectSubtree: function(){
      graph.selectSubtree();
    },
    rename: function(){
      var vm;
      var content;
      var nodes = graph.getSelectedNodes();
      console.log("renaming nodes: ",nodes);

      content = jQuery( "<rename-nodes params='names: input, newNames: newNames'></rename-nodes>")[0];

      vm = {
        input: ko.observableArray(nodes.map(function(node){
          return {id:node.id,
            label: node.data && node.data.partName};
        })),
        newNames: ko.observableArray(),
      };
      ko.applyBindings(vm,content);


      alertify.renameNodes("").set({
        labels: {
          ok: "Rename",
        },
        transition: "zoom",
        title: "Rename Nodes",
        onok: function(){
          console.log("new names: ",vm.newNames());
          postJSON("/morf/PartType/rename","",vm.newNames(),
              function(result){
                console.log(" new names from db: ",result);
                result.forEach(function(name){
                  graph.addNode(name.id);
                });
          });
        },
      }).
      setContent(content).
      resizeTo("50%","80%");
    },
    fit: function(){
      graph.fit();
    },
    collapse: function(){
      var nodes=graph.getSelectedNodes();
      nodes.forEach(function(node){
        graph.collapse(node.id);
      });

    },
    expand: function(){
      var nodeIds=graph.getSelectedNodeIds();
      console.log("expanding nodes: ",nodeIds);
      nodeIds.forEach(function(nodeId){
        graph.expand(nodeId);
      });

    },
    remove:function(){ //does not delete from database, just remove from screen
      graph.getSelectedNodeIds().forEach(function(nodeId){
        graph.removeNode(nodeId);
      });
    },  
  


  }
  viewModel.runFilter = ko.computed(function(){
    console.log("filter value: ",viewModel.filter());
    if(graph != null)
      graph.highlight(viewModel.filter());

  }).extend({rateLimit:{timeout:500,method:"notifyWhenChangesStop"}});

  fetchJSON("/morf/TableFeeds/part_lists/LookupPartTypes/all","",function(result){
    orderObjectsBy(result,"partType");
    result.unshift({partType:"Any",partTypeKey: -1});
    viewModel.partTypes(result);
  });

  graph = new DagEditor({
    element: jQuery("#graph")[0],
    nodeIdField: "partNumber",
    direction: "RL",
    getNodeURL: "/morf/PartType/children/${NODE_ID}",
    selectNode: selectNode,
    deleteNodeURL: "/morf/PartType/single",
    deleteEdgeURL: "/morf/PartType/link/delete",
    createEdge: linkParts,
    editNode: editNode,
    locale: {
       edit: 'Edit',
       del: 'Delete selected',
       back: 'Back',
       addNode: 'Add Part',
       addEdge: 'Add Link',
       editNode: 'Edit Part',
       editEdge: 'Edit Link',
       addDescription: 'Click in an empty space to place a new part.',
       edgeDescription: 'Click on a part and drag the link to another part to connect them.',
       editEdgeDescription: 'Click on the control points and drag them to a part to connect to it.',
       createEdgeError: 'Cannot add links to a cluster.',
       deleteClusterError: 'Clusters cannot be deleted.',
       editClusterError: 'Clusters cannot be edited.'
    },


  });

  partNumberPar = getURLParameter("partNumber");

  //if(partNumberPar == null)
    //partNumberPar = 2256280;


  if(partNumberPar != null){
    graph.addNode(partNumberPar).
      then(function(){
        graph.fit();
      });
  }

  ko.applyBindings(viewModel);

  //TODO: filter all visible nodes by part type

  function selectNode(nodeData,callback){

    //TODO: add select by part type filter
    var content = jQuery(
           "<div>"+
                "<select class='form-control' data-bind=\" "+
                "  options: partTypes, "+
                "  optionsText: 'partType', "+
                "  optionsValue: 'partTypeKey', "+
                "  value: selectedPartTypeKey\"> "+
                "</select> "+
                "<p>&nbsp;</p>"+
                "<div data-bind='with: options'>"+
                  "<input class='form-control' id='nodeSelector' placeholder='Part Name' "+
                        " data-bind=\"typeahead: $root.value, "+
                    "typeaheadOptions: $data\">"+
                "</div>"+
                  //{ "+
                  //  "remote: '/morf/PartType/partSearch/%QUERY' }\"> "+
                "</input>"+
            " </div>")[0];
    var vm = {
      value: ko.observable(),
      partTypes: viewModel.partTypes(),
      selectedPartTypeKey: ko.observable(),
    };
    vm.options= ko.computed(function(){
      var params="";
      if(vm.selectedPartTypeKey() !== -1)
        params="?partTypeKey="+vm.selectedPartTypeKey();
      console.log("regenerating type ahead options. param: "+params);
      return {remote: '/morf/PartType/partSearch/%QUERY'+params};
    }),

    ko.applyBindings(vm,content);

    alertify.selectNode("").set({
        labels: {
          ok: "Select",
        },
        transition: "zoom",
        title: "Select Node",
        onok: function(){
          console.log("new names: ",vm.value());
          graph.addNode(vm.value().nodeId);
        },
      }).
      setContent(content).
      resizeTo("30%","80%");

      callback(null);

  }

  function linkParts(edgeData,callback){
    console.log("edgeData: ",edgeData);

    function getValue(linkType){
      if(linkType.partLinkTypeKey !== 0) //no value
        alertify.prompt("Link Value",linkType.partLinkType+" value: ",
            "",function(event,value){
              doLink(linkType,value);},
            function(){ callback(null)});
      else
        doLink(linkType,0);

    }
    function doLink(linkType,value){
      if(value == null || value === "")
        alertify.error("No link value given, but required");
      else
        fetchJSON("/morf/PartType/link/"+linkType.partLinkTypeKey+
                  "/"+edgeData.to+"/"+edgeData.from+"/"+value,"",function(){
                    callback(edgeData);
                  });

    }
    fetchJSON("/morf/PartType/validPartLinkTypes/"+edgeData.to+"/"+edgeData.from,"",
          function(linkTypes){
            console.log("link types: ",linkTypes);
            if(linkTypes.length === 0){
              alertify.error("Linking those parts is not allowed. "+
                  "Make sure you're linking in the correct direction");
              callback(null);

            }else if(linkTypes.length === 1){
              getValue(linkTypes[0]);
            }else{ //need to ask user
              alertify.linkTypeSelector(function(selectedLinkType){
                getValue(linkTypes[0]);
              },{
                linkTypes: ko.observableArray(linkTypes)
              }).set('oncancel',function(){
                console.log("linking cancelled");
                callback(null);
              });

            }
          })
     
  }
  function editNode(nodeData,callback){
      var content;
      var data = nodeData.data;
      content =jQuery("<div>");

      for(fieldName in data){
        if(data.hasOwnProperty(fieldName)){
          content.append("<div><label>"+fieldName+":</label>"+
              data[fieldName]+"</div>");
        }
      }
      alertify.alert().
        setHeader("Part Data").
        setContent(content[0]).
        set("transition","zoom").
        set("onok",function(){
          callback(nodeData)
        }).
        show();


    }


  defineAlertifySelector("linkTypeSelector","Link Types",
      jQuery( "<div>"+
              "<label for='linkTypes'>Available Link Types:</label> "+
              "<input id='linkTypes' data-bind='selectize: value, "+
                "selectizeOptions: { "+
                  "options: linkTypes, "+
                  "labelField: \"partLinkType\", "+
                  "valueField: \"partLinkTypeKey\", "+
                  "create: false, "+
                  "createOnBlur: false, "+
                  "closeAfterSelect: false, "+
                  "placeholder: \"Available Link Types\", "+
                  "maxItems: 1, "+
                "}, selectizeMode: \"fixedOptions\"'> "+
              "</input> </div>")[0],
        {
          linkTypes: ko.observableArray(),
          value: ko.observable(),
        });




}
 
