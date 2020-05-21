
var dagNet;
var dagNodes;

function DagEditor(editorOptions) {
  /* required options
   * --------------------
   * element: DOM element to bind network to
   * nodeIdField: field name of object return by getNode URL to be used to identify the object
   *
   * getNodeURL: URL pattern to fetch node from. Node ID will be placed where the string ${NODE_ID} is.
   * deleteNodeURL: URL pattern to use to delete a node. 'nodeIdField' will be used as the parameter
   *                 name to list node ids. E.g.: <deleteNodeURL>?<nodeIdField>=id1&<nodeIdField>=id2
   * createEdge: a function to link to nodes. It is passed a 'from' nodeId, and a 'to' nodeId. return true on success.
   * editNode: a function to display or edit node data. It is given 'nodeData' and a callback to run.
   *
   * direction: either "RL" (right to left) or "LR" (left to right). Defaults to "LR".
   *
   *
   * optional options
   * -----------------
   * graphOptions: vis.Network options to be merged with default options
   *
   */

  var graphOptions;
  var network;
  var nodes,edges;
  var maxExapandableParents=100;
  var childDirection;

  if(editorOptions.direction == null){
    editorOptions.direction = "LR";
  }

  if(editorOptions.direction === "LR")
    childDirection= "to";
  else
    childDirection= "from";


  graphOptions = {
   layout: {
      randomSeed: undefined,
      improvedLayout: true,
      hierarchical: {
        enabled:true,
        levelSeparation: 300,
        direction: editorOptions.direction,
        sortMethod: 'directed'   // hubsize, directed
      }
    },

    edges: {
      arrows: {
        middle: true,
      },
      smooth: false,
    },
    nodes: {
      shape: 'box',
      mass: 3,
      shadow: true,
      color: {
          background: 'white',
          border: 'blue',
          highlight: {
            background: 'pink',
            border: 'red'
          }
         },
    },
	  interaction: {
      multiselect: true,
      keyboard: false,
	  },
    physics:{
      stabilization:{
        iterations: 1,
      },
    },
    groups: {
      default: {
        color:{
          border: "blue",
          background: "white",
        },
        shadow: {
          size: 5,
        },
      },
      missingParents: {
        color:{
          border: "green",
          background: "white",
        },
        shadow: {
          size: 5,
        },
      },
      greyed: {
        color: {
          border:"#d9d9d9",
          background: "white",
        },
        font: {
          color: "#d9d9d9",
          size: 5,
        },
        shadow: false,

      }
    },
    manipulation: {
      enabled: true,
      addNode: function(nodeData,callback){
        console.log("would create node:");
        console.log(nodeData);
        editorOptions.selectNode(nodeData,callback);
      },
      editNode: function(nodeData,callback){
        console.log("edit node: ",nodeData);
        if(editorOptions.editNode != null)
          editorOptions.editNode(nodeData,callback);
        else
          callback(null);

      },
      deleteNode: function(selection, callback){
        console.log("deleting node ",selection);
        var nodesToDelete= jQuery("<ul>").append(
            selection.nodes.map(function(nodeId){
              return jQuery("<li>").text(nodes.get(nodeId).label)[0];
            }));

        alertify.confirm().
          setHeader("Delete Nodes?").
          setContent(nodesToDelete[0]).
          set("onok",function(event){
            console.log('deleting');
            deleteNodes(selection.nodes);
          }).
          show();
        callback(null);
      },
      addEdge: function(edgeData,callback){
        console.log("addEdge: ",edgeData);
        if(editorOptions.createEdge)
          editorOptions.createEdge(edgeData,callback);
        else
          callback(null);
      },
      //TODO: need a part_link_key for edges, but query is currentl to slow for that
      editEdge: function(edgeData,callback){
        console.log("editEdge: ",edgeData);
        console.log("original edge: ",edges.get(edgeData.id));
        //if(editorOptions.createEdge)
          //editorOptions.createEdge(edgeData,callback);
        //else
          //callback(null);
      },

      deleteEdge: function(selection, callback){
        console.log("deleting edges: ",selection);
        var edgesToDelete= jQuery("<ul>").append(
            selection.edges.map(function(edgeId){
              var edge,fromNode,toNode;
              edge=edges.get(edgeId);
              fromNode = nodes.get(edge.from);
              toNode = nodes.get(edge.to);
              //console.log("edge: ",edge,fromNode,toNode);
              return jQuery("<li>").text(fromNode.label+" -> "+toNode.label )[0];
            }));
        alertify.confirm().
          setHeader("Delete Edges?").
          setContent(edgesToDelete[0]).
          set("onok",function(event){
            console.log('deleting');
            deleteEdges(selection.edges);
          }).
          show();
        callback(null);


      }

    }
  };

  if(editorOptions.locale){
    graphOptions.locales ={main: editorOptions.locale};
    graphOptions.locale='main';
  }
  

  nodes = new vis.DataSet([]);
  edges = new vis.DataSet([]);

  //if performance becomes a problem, experiment more with queue settings
  //nodes.setOptions({queue:{delay:500,max:100}});

  network = new vis.Network(editorOptions.element, {nodes:nodes,edges:edges},graphOptions);
  dagNet= network; //JUST FOR DEBUGGIN
  dagNodes=nodes;
  network.enableEditMode();

  network.on("selectNode", function (properties) {
    console.log("selected Node: ",properties);
    var nodeId = properties.nodes[0];
    if(nodeId != null){
      console.log("selected node data: ",nodes.get(nodeId));
    }
  });
  network.on("doubleClick", function (properties) {
    var node;
    console.log("node double clicked: ",properties);

    // load parent nodes
    if(properties.nodes && properties.nodes[0] != null ){

      node = nodes.get(properties.nodes[0]);

      if(node.parents == null)
        return;
      if(node.parents.length >= maxExapandableParents){
        alertify.error("Cannot expand selected node, it has "+node.parents.length+
            " parents, which is more than my max of "+maxExapandableParents);
        return;
      }

      //console.log("loading missing parents of ",node);
      node.parents.filter(function(parentNodeId){
        //console.log(parentNodeId+" missing ?"+nodes.get(parentNodeId) == null);
        return nodes.get(parentNodeId) == null;
      }).forEach(function(missingParentNodeId){
        //console.log("loading missing parent "+missingParentNodeId);
        addNode(missingParentNodeId);
      });
    }
  });

  function addNode(nodeId){
    var url = editorOptions.getNodeURL.replace("${NODE_ID}",nodeId);
    return fetchJSON(url,"",function(result){
      console.log("addNode: ",result);
      nodes.update(result.nodes);
      edges.update(result.edges);
      markNodesWithMissingParents();
    }).
    then(function(){
      network.focus(nodeId);
    });
;
  }
  function deleteNodes(nodeIds){
    var url= editorOptions.deleteNodeURL;
    var nodeIdField = editorOptions.nodeIdField;
    url = url +"?"+nodeIds.map(function(nodeId){
      return nodeIdField+"="+nodeId;
    }).join("&");

    ajaxDelete(url,"",function(){
      nodes.remove(nodeIds);
    });


  }
  function deleteEdges(edgeIds){
    var edgesToDelete = edgeIds.map(function(edgeId){
      var edge =  edges.get(edgeId);
      return {from: edge.from, to: edge.to};
    });

    console.log("edges: ",edgeIds, edgesToDelete);
    postJSON(editorOptions.deleteEdgeURL,"",edgesToDelete,
        function(){
          console.log("removing edges from local graph ",edgeIds);
          edges.remove(edgeIds);
        });

    

  }
  function markNodesWithMissingParents(){
    //console.log("====== Marking Nodes with Missing Parents ======");
    nodes.forEach(function(node){
      if(node.parents == null)
        return;
      if(nodes.get(node.parents).indexOf(null) !== -1){ //found a null, a missing parent node
        //console.log("found missing parent of node ",node);
        node.group="missingParents";
        nodes.update(node);
      }else if(node.group==="missingParents"){
        //node.color=null;
        node.group="default";
        nodes.update(node);
      }
    });
    //console.log("===== Done marking nodes =======");

  }
  function subTreeNodeIds(rootNodeId,collectedNodeIds){
    console.log("root node: "+rootNodeId+". ",collectedNodeIds);
    if(collectedNodeIds == null)
      collectedNodeIds = [];
    collectedNodeIds.push(rootNodeId);

    network.getConnectedNodes(rootNodeId,childDirection).forEach(function(nodeId){
      console.log("child ",nodeId);
      collectedNodeIds = subTreeNodeIds(nodeId,collectedNodeIds);
    });
    console.log("returning nodes: ",collectedNodeIds);

    return collectedNodeIds;
  }
  function selectSubtree(rootNodeId){

    if(rootNodeId == null){
      //console.log("no root given, using selection");
      network.getSelectedNodes().forEach(function(nodeId){
        //console.log("CASE 1: selecting sub tree "+nodeId);
        selectSubtree(nodeId);
      })
    }else{
      network.setSelection(
          { nodes:subTreeNodeIds(rootNodeId)},
          { unselectAll: false,highlightEdges: true});
    }
  }

  return {
    addNode: addNode,
    removeNode: function(nodeId){
      nodes.remove(nodeId);
    },
    fit: function(options){
      network.fit(options);
    },
    selectSubtree: selectSubtree,
    getSelectedNodeIds: function(){
      return network.getSelectedNodes();
    },
    getSelectedNodes: function(){
      return network.getSelectedNodes().map(function(nodeId){
        return nodes.get(nodeId);
      });
    },
    collapse: function(nodeId){
      var node= nodes.get(nodeId);
      var subTree = subTreeNodeIds(nodeId);

      network.clustering.cluster({
        clusterNodeProperties: {
          id: nodeId * 1000,
          label: node.label+" \nSub-Tree",
          shape: 'triangle',
              
        },
        joinCondition(nodeOptions){
          return subTree.indexOf(nodeOptions.id) !== -1;
        }
      });
    },
    expand: function(nodeId){
      if(network.clustering.isCluster(nodeId))
        network.clustering.openCluster(nodeId);

    },
    highlight: function(query){
      var q = new RegExp(query,"i");
      console.log("highlighting with query ",query);
      nodes.forEach(function(node){
        if(node.originalGroup == null)
          node.originalGroup = node.group || "default";


        if(node.label.match(q) != null){ //matched query
        //  console.log("matched ",[node.group,node.originalGroup]);
          node.group = node.originalGroup || "default";
          node.originalGroup=null;
        }else{
          node.group = "greyed";
        }
        nodes.update(node);
      });
      setTimeout(function(){ network.fit();},1000);
    },

  };

}

