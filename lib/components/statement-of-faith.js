

function getLinkCode(verseRef){
    //<a class="rtBibleRef" href="https://biblia.com/bible/nasb95/2%20Pet.%202.4" 
        //data-reference="2 Pet. 2.4" data-version="nasb95" data-purpose="bible-reference" target="_blank">2 Pet. 2:4</a>
    
    console.log("getting link code for ref "+verseRef);
    var code = "<a class='rtBibleRef' href='https://biblia.com/bible/nasb95/"+verseRef+"' "+
                "data-reference='"+verseRef+"' data-version='nasb95' data-purpose='bible-reference' "+
                "target='_blank'>"+verseRef+"</a>";
            
    console.log("code: ",code);
    return code;

}
function initRefs(){
    window.refTagger = {
		settings: {
			bibleVersion: "NASB",			
			socialSharing: ["twitter","facebook"]
		}
    };
    //$.getScript("//api.reftagger.com/v2/RefTagger.js", function(){
    $.getScript("https://av1611.com/verseclick/verseclick.js", function(){
        console.log("loading reftagger js");
    });
    
    //var tag="script";
    //var g = document.createElement(tag);
    //var s = document.getElementsByTagName(tag)[0];
    //g.src = "//api.reftagger.com/v2/RefTagger.js";
    //s.parentNode.insertBefore(g, s);


	//(function(d, t) {
	//}(document, "script"));

}

export function register(){
    //const statements = require("../data/sof.json");
//    const statements = statementsRaw.map(statement =>{
//        console.log("parsing statement",statement);
//        statement.content = statement.content.replace(/\[(.*?)\]/g,(match) =>{
//            console.log("got match: ",match);
//            match = match.replace(/[\[\]]/g,"");
//            return getLinkCode(match);
//        })
//        return statement;
//
//    });


    ko.components.register('statement-of-faith', {
       viewModel: function(params) {
            var self=this;


            //self.statements = ko.observableArray(statements);

            //initRefs();

       },
       template: require('./statement-of-faith.html'),
    });
}
 