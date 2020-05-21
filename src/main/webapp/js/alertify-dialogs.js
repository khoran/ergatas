alertify.programSelector || alertify.dialog("programSelector",function(){
    var selectProgramsFn;
    var dialogVM={};
    return {
      main:function(callback){
        var content = jQuery("<program-selector params='getCurrentSelection: selectionCallback '></program-selector>")[0];
        dialogVM.selectionCallback = ko.observable();
        //selectionCallback will be set to a function value when bound.
        ko.applyBindings(dialogVM,content);

        this.setContent(content);

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
          if(dialogVM.selectionCallback() != null)
            dialogVM.selectionCallback()(selectProgramsFn);
          else
            console.log("WARNING: no programTable value set, or no callback function set");
        }
      },
    };
  });


defineAlertifySelector("fileTypeSelector","File Types",
    jQuery( "<div>Select all desired file types.<p>"+
            "<label for='fileTypes'>Available File Types:</label> "+
            "<input id='fileTypes' data-bind='selectize: value, "+
              "selectizeOptions: { "+
                "options: fileTypes, "+
                "labelField: \"displayName\", "+
                "valueField: \"masterSetGroupKey\", "+
                "create: false, "+
                "createOnBlur: false, "+
                "closeAfterSelect: false, "+
                "placeholder: \"Available File Types\", "+
                "maxItems: null, "+
              "}, selectizeMode: \"fixedOptions\"'> "+
            "</input> </div>")[0],
    (function(){
      var vm={
        fileTypes: ko.observableArray(),
        value: ko.observable("20"),
      }

      fetchJSON("/morf/TableFeeds/orders/LookupOrderableFileTypes/all","",function(result){
        orderObjectsBy(result,"format");
        vm.fileTypes(result);
      })
        
      return vm;


    }()));


defineAlertifySelector("nodeSelector","Select Node",
       jQuery(
           "<div>"+
            "<label for='nodeSelector'>Node Selector</label> "+
            "<input id='nodeSelector' placeholder='Node Name' data-bind=\"typeahead: value, "+
              "typeaheadOptions: { "+
                "remote: '/morf/PartType/partSearch/%QUERY' }\"> "+
            "</input> </div>")[0]);


function defineAlertifySelector(name,title,content,vm){
  alertify[name] || alertify.dialog(name,function(){
      var callbackFn;
      var dialogVM=jQuery.extend({
        value: ko.observable(),
      },vm);
      return {
        main:function(callback,localVM){
          //need to clone so repeated uses does not apply
          //binding to same element.
          var c=jQuery(content).clone()[0];
          console.log("content: ",c);
          if(localVM != null)
            dialogVM = jQuery.extend(dialogVM,localVM);
          
          console.log("applying bindings. vm: ",dialogVM);
          ko.applyBindings(dialogVM,c);
          this.setContent(c);
          callbackFn= callback;
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
              title: title,
              transition: "zoom",
            }
          };
        },
        callback: function(closeEvent){
          if(closeEvent.index === 0 ){ //select button clicked
            if(callbackFn!= null)
              callbackFn(dialogVM.value());
          }
        },
        settings:{
          oncancel: undefined
        },
        hooks:{
          onclose:function(){
            var closeFn = this.get("oncancel");
            if(closeFn != null)
              closeFn();
          }
        },

      };
    });

}
