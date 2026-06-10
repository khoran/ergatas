import { BaseRepo } from './base-repo.js';
import * as H from '../headers.js';

export class SubscriptionsRepo extends BaseRepo {
    getPushSubscriptions(lists){
        var query="";
        if(lists.indexOf("daily_prayer_list") !== -1)
          query = query+"daily_prayer_list=eq.true&";

        if(query === "")
         return [];

        return this.client.retry(3,async()=>{
            return this.client.authGet("/push_subs_view?"+query);
        });
    }
    getPushSubscription(push_subscription_key){
        return this.client.retry(3,async()=>{
            return this.client.authGet("/push_subs_view?push_subscription_key=eq."+push_subscription_key,
                                    H.single());
        });
    }

    insertPushSubscription(subscription,lists){
       var data = {
          endpoint: subscription.endpoint,
          subscription: subscription
       };
       console.info("sub lists: ",lists);
       lists = lists || [];
       lists.forEach(list => data[list]=true);

       console.info("data: ",data);

       return this.client.retry(3,async()=>{
            return this.client.authPost("/push_subs_view?on_conflict=endpoint",
                                   data,H.ignoreDups());
        });
    }
    /**
     * listStates: object where keys are list names, and values are true or * false
     */
    updatePushSubscription(subscription,listStates){
       return this.client.retry(3,async () =>{
            return await this.client.authPatch("/push_subs_view?endpoint=eq."+subscription.endpoint,
                                    listStates,H.single(H.representation()));
        });
    }
    deletePushSubscription(subscription){
       return this.client.retry(3,async () =>{
            return await this.client.authDelete("/push_subs_view?endpoint=eq."+subscription.endpoint,
                                    H.single(H.representation()));
        });
    }
}
