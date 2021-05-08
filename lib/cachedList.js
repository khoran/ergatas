
export class CachedList{
    constructor(updateFn, selectFn, minUpdateTime = 300){

        var self=this;
        self.updateFn = updateFn;
        self.selectFn = selectFn;
        self.minUpdateTime = minUpdateTime;

        self.list = ko.observable();
        self.promise;
        self.lastUpdate;

        self.updateList();

        //self.test = 0;
    }
    updateList(){
        var self=this;
        if( self.lastUpdate != null && (new Date()) - self.lastUpdate < self.minUpdateTime ){
            console.log("skipping update, minUpdateTime has not elapsed yet");
            return self.promise;
        }

        self.lastUpdate = new Date();
        self.promise = self.updateFn().then( data=> { 

            //console.log("original data: "+data.length);
            //FOR DEBUGGING 
           // if(self.test < 1){
           //     self.test = self.test + 1;
           //     data = data.filter( i => i.cause_key != 7);
           //     console.log("filtered data: "+data.length);
           // }


            self.list(data); 
            return data;
        });
        return self.promise;
    }
    listObs(){
        return this.list;
    }

    findItem(findFn){
        return this.promise.then(data =>{
            return data.find(findFn);
        })
    }
    selectItems(keys,resultObs){
        var self=this;
        var singleValue = false;

        if(keys == null)
            return;

        if( ! Array.isArray(keys)){
            singleValue = true;
            keys = [keys]; //will unwrap at the end
        }

        var setResult = (result) =>{
            if(singleValue && result.length > 0)
                resultObs(result[0]);
            else
                resultObs(result);
        }

        return self.promise.then( data =>{

            var items = self.selectFn(keys,data);
            var numUndefined = items.filter( i => i == null).length;
            if(numUndefined > 0){
                console.log("found "+numUndefined+" missing items. keys: ",keys);
                //try to update the list and select again
                this.updateList();
                self.promise.then( data =>{

                    var items = self.selectFn(keys,data);
                    var nonNull = items.filter( i => i != null);
                    if(keys.length - nonNull.length > 0){
                        console.info("some items still missing",keys,items);
                    }
                    //set the result with whatever we got
                    setResult(nonNull);
                });
 
            }else{
                console.log("all items found");
                setResult(items);
            }
            
        });
    }

}