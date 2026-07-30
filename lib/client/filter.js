

/**
 * @param fieldName database name of filter field
 * @param value an observable holding the current value of the field
 * @param filterAppender object of class FilterAppender
 */
export class Filter{    
    constructor(fieldName,filterAppender,rateLimit,isDefinedOnEmpty=false){
        this.fieldName=fieldName;
        this.value = ko.observable();
        this.filterAppender = filterAppender;
        this.isDefinedOnEmpty=isDefinedOnEmpty;

        if(rateLimit != null)
            this.value = this.value.extend({ rateLimit: { timeout: rateLimit, method: "notifyWhenChangesStop" } });

    }
    name(){
        return this.fieldName;
    }
    isDefined(){
        const v = this.value();
        if(Array.isArray(v))
            //return v != null; // && v.length !== 0;
            return v != null && (this.isDefinedOnEmpty || v.length !== 0);
        else 
            return v != null && (this.isDefinedOnEmpty || v != "");
    }
    clear(){
        this.value(undefined);
    }
    obs(){
        return this.value;
    }
}