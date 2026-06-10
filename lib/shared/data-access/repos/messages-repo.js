import { BaseRepo } from './base-repo.js';
import * as H from '../headers.js';

export class MessagesRepo extends BaseRepo {
    // Message Queue
    insertMessage(external_user_id,fromEmail,name, message){
     return this.client.retry(3,async () =>{
            return this.client.authPost("/message_queue_view",
                    {
                       external_user_id: external_user_id,
                       from_name: name,
                       from_email: fromEmail,
                       message: message
                    });
        });
    }
    getMessage(message_queue_key){
        return this.client.retry(3,async () =>{
            return this.client.authGet("/message_queue_view?message_queue_key=eq."+message_queue_key,H.single());
        });
    }
    getAllMessages(){
        return this.client.retry(3,async () =>{
            return this.client.authGet("/message_queue_view?order=created_on");
        });
    }
    deleteMessage(message_queue_key){
        return this.client.retry(3,async () =>{
            return this.client.authDelete("/message_queue_view?message_queue_key=eq."+message_queue_key);
        });
    }
}
