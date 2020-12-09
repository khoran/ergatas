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
                //console.log("updating country codes with new value "+country.alpha3Code+" "+newValue);
                if(newValue === ALL)
                    countryCodesObs.push(country.alpha3Code);
                else
                    countryCodesObs(countryCodesObs().filter(x => x != country.alpha3Code));
                countryNode.parent.updateState();
                //console.log("final country codes: ",countryCodesObs());
            });   
        });

        return root;
    });
 }
function all(bools){
    return   bools.map(x => !!x).indexOf(false) === -1;
}
export function register(){
   const name="country-selector";
   ko.components.register(name, {
       viewModel: function(params) {
            var self=this;
            self.title=params.title;
            self.server = params.server;
            console.log("params: ",params);
            self.countryCodes = params.countryCodes;

            self.countryTree = ko.observable();
            var start = new Date();
            buildTree(self.countryCodes).then((tree)=>{
                self.countryTree(tree);
                console.log("build time: ", ((new Date())-start ) / 1000);
            })


            self.flip = function(obs){
                return function(){obs(!obs());};
            }
        },
       template: require(`./${name}.html`),
    });
}
 