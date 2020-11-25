/**
 * INPUT
 * ---------
 *    - 
 * OUTPUT
 * ---------
 *    - countryCodes: should be an observable that will be set to an array of 3166 alpha-3 country codes
 */


const countryUrl = "https://restcountries.eu/rest/v2/all";
 //node states
 const NONE = 1;
 const SOME = 2;
 const ALL = 3;

 class Node {
     constructor(_name,_parent){
         this.name = _name;
         this.parent = _parent;
         this.state = ko.observable(NONE);
     }
     stateClass() {
        return ko.pureComputed(() =>{
            if(this.state() === NONE)
                return "fa-2x far fa-square";
            else if(this.state() === SOME)
                return "fa-2x far fa-minus-square";
            else if(this.state() === ALL)
                return "fa-2x far fa-check-square";
            else
                return "";
        });
     }
     setSelected(){}
     setNotSelected(){}

     toggleSelectionFn(){
        return ()=>{
            if(this.state() === ALL){
                this.setNotSelected();
            }else   
                this.setSelected();
        };
     }

 }
 class InternalNode extends Node {
     constructor(_name,_parent){
         super(_name,_parent);
         this.children = [];
         this.childIndex = {};
         this.expanded = ko.observable(false);
     }
     findNode(name){
        if(this.childIndex[name] != null)
            return this.childIndex[name];
        else
            return null;
     }
     getOrCreateNode(name){
        var node = this.findNode(name);
        if(node != null)
            return node;
        else{
            node = new InternalNode(name,this);
            this.addNode(node);
            return node;
        }
     }
     addNode(node){
         this.children.push(node);
         this.childIndex[node.name] = node;
     }
    setSelected(){
        this.state(ALL);
        this.children.forEach((node)=>{
            node.setSelected();
        });
     }
     setNotSelected(){
        this.state(NONE);
        this.children.forEach((node)=>{
            node.setNotSelected();
        });
     }
     updateState(){
        var childStates = this.children.map( (node) =>{
            return node.state();
        });
        //if all children are ALL => ALL
        if( all(childStates.map((state) => state === ALL)) )
            this.state(ALL);
        //if all children are NONE => NONE
        else if( all(childStates.map((state) => state === NONE)) )
            this.state(NONE);
        //if any children are SOME or ALL => SOME
        else
            this.state(SOME);
        
        if(this.parent != null)
            this.parent.updateState();
     }
 }
 class LeafNode extends Node {
     constructor(_name,_flagUrl,_countryCode,_parent){
         super(_name,_parent);
         this.flagUrl = _flagUrl;
         this.countryCode = _countryCode;
        
     }
     setState(isChecked){
         this.state(isChecked ? ALL : NONE);
     }
     setSelected(){
        this.setState(true);
     }
     setNotSelected(){
        this.setState(false);
     }
 }
 function buildTree(countryCodesObs){

    const root = new InternalNode("Global",null);

    return jQuery.get(countryUrl).then((result)=>{
        result.forEach((country) =>{

            //uninhabited areas
            if(country.region === "" || country.subregion ==="")
                return;

            var region = root.getOrCreateNode(country.region);
            var subregion = region.getOrCreateNode(country.subregion);
            var countryNode = new LeafNode(country.name,country.flag,country.alpha3Code,subregion);
            subregion.addNode(countryNode);
            
            countryNode.setState(countryCodesObs().indexOf(country.alpha3Code) !== -1);

            countryNode.parent.updateState();

            countryNode.state.subscribe((newValue) =>{
                console.log("updating country codes with new value "+country.alpha3Code+" "+newValue);
                if(newValue === ALL)
                    countryCodesObs().push(country.alpha3Code);
                else
                    countryCodesObs(countryCodesObs().filter(x => x != country.alpha3Code));
                countryNode.parent.updateState();
                console.log("final country codes: ",countryCodesObs());
            });   
        });

        return root;
    });
 }


function objectItems(object){
    var items = [];
    for(var fieldName in object){
        if( fieldName != "checked" && fieldName != "expanded" && fieldName != "partial" && object.hasOwnProperty(fieldName)){
            items.push({
                name: fieldName,
                item:object[fieldName]
            });
        }
    }
    return items;
}
/*
function select(object){
    console.log("selecting countries: ",object);
    if(object.countryCode != null)
        object.checked( ! object.checked());
    else { 
        object.checked( ! object.checked());
        self.objectItems(object).forEach((item) =>{
            self.select(item.item);
        });
    }
}
*/
function updateState(object){

        var allChecked = all(objectItems(object).map((item) =>{
            console.log(item.name,item.item.checked());
            return item.item.checked();
        }));
        console.log("all checked? ",allChecked);
        if(object.checked() !== allChecked)
            object.checked(allChecked);
        
        //object.partial(some(objectItems(object).map((item) =>{
        //    if(item.item.partial == null)
        //        return item.item.checked();
        //    return item.item.partial() ;
        //})));
}
function getCountryList(countryCodesObs){
    const url = "https://restcountries.eu/rest/v2/all";
    console.log("downloading country list data");
    return jQuery.get(url).then((result)=>{
        var building=true; //don't change countryCodesObs while building
        var initNode = function(name){
            var node =  {
                checked:ko.observable(true),
                partial:ko.observable(false),
                expanded: ko.observable(false),
            };
            node.checked.extend({ notify: 'always' });
            node.checked.subscribe(function(newValue){
                if(building) return;
                //console.log(" new value set on "+name);
                objectItems(node).forEach((item) =>{
                    item.item.checked( newValue);
                });
            });
            return node;
        }
        var countryTree = initNode("Global");
        console.log("got country list",result);



        result.forEach((country) =>{
            var region, subregion,countryNode;
            //console.log(`region: ${country.region}, sub region: ${country.subregion}, code: ${country.alpha3Code}, name: ${country.name}`);

            //uninhabited areas
            if(country.region === "" || country.subregion ==="")
                return;
           
            if(country.region !== "" && countryTree[country.region] == null)
                countryTree[country.region] = initNode(country.region);
            

            if(country.region !== "" && country.subregion !== "" && countryTree[country.region][country.subregion] == null)
                countryTree[country.region][country.subregion] = initNode(country.subregion);

            countryTree[country.region][country.subregion][country.name] = {
                name: country.name,
                flagUrl: country.flag,
                countryCode: country.alpha3Code,
                checked: ko.observable(countryCodesObs().indexOf(country.alpha3Code) !== -1),
            };
            countryNode = countryTree[country.region][country.subregion][country.name];
            countryNode.checked.subscribe(function(newValue){
                if(building) return;
                console.log("updating country codes with new value "+country.alpha3Code+" "+newValue);
                if(newValue)
                    countryCodesObs().push(country.alpha3Code);
                else
                    countryCodesObs(countryCodesObs().filter(x => x != country.alpha3Code));
                updateState(subregion);
                updateState(region);
                updateState(countryTree);
                console.log("final country codes: ",countryCodesObs());
            });

            subregion = countryTree[country.region][country.subregion];
            //each subregion will start off with a true value. If any country under it
            // is false (not checked), then the subregion becomes false also
            subregion.checked(subregion.checked() && countryNode.checked());
            subregion.partial(subregion.partial() || countryNode.checked());

            region  = countryTree[country.region];
            region.checked(region.checked() && countryNode.checked());
            region.partial(region.partial() || countryNode.checked());

            countryTree.checked(countryTree.checked() || countryNode.checked());
            countryTree.partial(countryTree.partial() || countryNode.checked());


        });
        building=false;
        console.log("country tree: ",countryTree);
        return countryTree;
    });
}
function all(bools){
    return   bools.map(x => !!x).indexOf(false) === -1;
}
function some(bools){
    return   bools.map(x => !!x).indexOf(true) === -1;
}
export function register(){
   const name="country-selector";
   ko.components.register(name, {
       viewModel: function(params) {
            var self=this;
            self.title=params.title;
            self.server = params.server;
            console.log("params: ",params);
            //self.countryCodes = ko.observableArray();
            self.countryCodes = params.countryCodes;

            self.countryTree = ko.observable();
            //getCountryList(self.countryCodes).then((tree)=>{
            var start = new Date();
            buildTree(self.countryCodes).then((tree)=>{
                self.countryTree(tree);
                console.log("build time: ", ((new Date())-start ) / 1000);
            })


            // JUST FOR DEBUGGING
            window.countrySelector=self;



            self.flip = function(obs){
                return function(){obs(!obs());};
            }
            //self.objectItems = objectItems;
        },
       template: require(`./${name}.html`),
    });
}
 