/** functions that can be imported by server and client
 * 
 */

import { AppError } from "./app-error.js";

export function ensureFields(object,fieldNames){
    for(var i in fieldNames){
        if(object[fieldNames[i]] == null)
            throw new AppError("ensureFields: missing field "+fieldNames[i]);
    }
}
