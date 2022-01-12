/**
 * INPUT
 * ------
 *      - server: server api object
 *      - da: data access object  
 */

export function register(){
   const name="message-moderation";
   ko.components.register(name, {
       viewModel: function(params) {
            var self=this;
            console.log("start of "+name);

            self.messageInfos = ko.observable();

            setTimeout(async function(){

                var infos = await params.server.authPostJson("/api/queuedMessages");
                infos.forEach(info => info.state=ko.observable("init"));
                self.messageInfos(infos);
                //console.log("messages: ",self.messageInfos());


            },3000)// try to wait till auth finishes

            self.sendMessage=function(messageInfo){
               params.server.authPostJson("/api/sendQueuedMessage",
                  {message_queue_key: messageInfo.message_queue_key}).
               then(() => messageInfo.state("sent"));
            }
            self.deleteMessage=function(messageInfo){
               params.server.authPostJson("/api/deleteQueuedMessage",
                  {message_queue_key: messageInfo.message_queue_key}).
               then(() => messageInfo.state("deleted"));
               
            }
            self.sendAll=function(){
               self.messageInfos().filter(info => info.state()==="init").forEach(self.sendMessage);
            }
            self.deleteAll=function(){
                alertify.confirm("","Really?! You want to delete ALL of them?",
                async function(evt,value){
                    console.info("Deleteing all queued message");
                    self.messageInfos().filter(info => info.state()==="init").forEach(self.deleteMessage);
                },function(){
                    alertify.message("I thought not!");
                })
            }


        },
       template: require(`./${name}.html`),
    });
}
 
