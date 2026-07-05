import {AppError} from '../../server/app-error.js';

export class FilterAppender{
    constructor(){
    }
    append(fieldName,value){
        throw new AppError("No append method defined for FilterAppender");
    }
}
export class FilterContext{
    constructor(_request){
        this.request=_request;
    }
    get request(){
        return this._request;
    }
    set request(r){
        this._request = r;
    }
}
export class UrlContext{
    constructor(url){
        if(url.indexOf("?") === -1)
            url = url +"?";
        this._url=url;
    }
    get url(){
        return this._url;
    }
    set url(r){
        this._url = r;
    }
}

export class ILikeFilterAppender extends FilterAppender{
    append(context,fieldName,value){
        //context.request = context.request.ilike(fieldName,'*'+value+'*');
        context.url= context.url + fieldName+"=ilike."+"*"+value+"*"+"&";
    }
}
export class FTSFilterAppender extends FilterAppender{
    append(context,fieldName,value){
        //context.url= context.url + fieldName+"=wfts."+value+"&";
        context.url= context.url + "query="+value+"&";
    }
}
export class ContainsFilterAppender extends FilterAppender{
    append(context,fieldName,value){
        //context.request = context.request.in(fieldName,value);
        context.url = context.url + fieldName+"=in.("+value.join(",")+")"+"&";
    }
}
 export class OverlapsFilterAppender extends FilterAppender{
    append(context,fieldName,value){
        //var q = {};
        //q[fieldName] = "ov.{"+value.join(",")+"}";
        //context.request = context.request.query(q);
        context.url = context.url + fieldName+"=ov.{"+value.join(",")+"}"+"&";
    }
}
 export class LessThanFilterAppender extends FilterAppender{
    append(context,fieldName,value){
        //context.request = context.request.lte(fieldName,value);
        context.url= context.url + fieldName+"=lte."+parseInt(value)+"&";
    }
}
 export class GreaterThanFilterAppender extends FilterAppender{
    append(context,fieldName,value){
        //context.request = context.request.gte(fieldName,value);
        context.url= context.url + fieldName+"=gte."+parseInt(value)+"&";
    }
}
