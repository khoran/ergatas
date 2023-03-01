
import mailchimp  from "@mailchimp/mailchimp_marketing";
import crypto from 'crypto';

export class MailingList {
    constructor(key, serverURL,listId){
        var self=this;

        mailchimp.setConfig({
            apiKey: key,
            server: serverURL,
        });

        self.mailchimp=mailchimp;
        self.listId = listId;



    }

    emailHash(email){
        return crypto.createHash("md5").update(email).digest("hex");
    }

    async removeUser(email){
        var self=this;
        const emailHash = self.emailHash(email);
        const listMember=await self.mailchimp.lists.getListMember(self.listId,emailHash);
        const tagNames = listMember.tags.map( tag => tag.name);

        //console.local("removing user. tags: ",tagNames);
        // if user has only the single tag "User", then remove.
        // also remove it the only two tags are User and Missionary
        if( (tagNames.length === 1 && tagNames[0]==="User") || 
            (tagNames.length === 2 && tagNames.includes("User") && tagNames.includes("Missionary"))){
            await self.mailchimp.lists.deleteListMember(self.listId,emailHash);
        }
    }
    async createUser(email){
        var self=this;
        await self.mailchimp.lists.addListMember(self.listId, {
                email_address:email,
                status:"subscribed",
            });
    }
    async ensureUser(email){
        var self=this;
        if( ! await self.userExists(email))
            await self.createUser(email);
    }
    async addTags(email,tags){
        var self=this;
        //console.local(`adding tags to list id ${self.listId}, email ${email} tags: `,tags);

        await self.mailchimp.lists.updateListMemberTags(self.listId,self.emailHash(email),{ 
            tags: tags.map( tag =>{
                return {name:tag,
                        status:"active"};
            })
        });
    }
    async addToGroup(email,group){
        var self=this;
        console.local(`adding group to list id ${self.listId}, email ${email} group: `,group);
        //in mailchimp, groups and interests are the same thing
       

        // find interest category named 'Interests'
        var categories = await self.mailchimp.lists.getListInterestCategories(self.listId);
        console.local("categories: ",categories);

        var interestsCatagory = categories.categories.find(cat => cat.title === "Interests");
        
        if(interestsCatagory == null){
           console.error(`no 'Interests' category found, could not add ${email} to group ${group}`);
           return;
        }


        // find given group within category
        var interests = await self.mailchimp.lists.listInterestCategoryInterests(self.listId,interestsCatagory.id);
        console.local("interests: ",interests);
       
        var givenInterest = interests.interests.find(interest => interest.name === group);
        if(givenInterest == null){
           console.error(`no group named ${group} found, could not add ${email} to group`);
           return;
        }

        console.log("found interest/group: ",givenInterest);
        // add given email to group
        var data = {interests:{}};
        data.interests[givenInterest.id] = true;
        await self.mailchimp.lists.updateListMember(self.listId,self.emailHash(email),data);
    }
    async setUserName(email,firstName,lastName){
        var self=this;

        await self.mailchimp.lists.updateListMember(self.listId,self.emailHash(email),{
            merge_fields:{
                FNAME:firstName,
                LNAME:lastName
            }
        });
    }

    async userExists(email){
        var self=this;
        try{
            await self.mailchimp.lists.getListMember(self.listId,self.emailHash(email));
            return true;
        }catch(error){
            return false;
        }
    }
    async getSegment(name){
       var self=this;
       var data;
       try{
          console.local("looking for segment "+name);
          data  = await self.mailchimp.lists.listSegments(self.listId,{
                        fields:["segments.id","segments.name"],
                     });
          console.local("segment list: ",data);
          return data.segments.
                  find( s => s.name===name).id;
       }catch(error){
          console.error("failed to find segment "+name);
          return null;
       }
    }
    async sendCampaign(segmentName,content,settings){
       var self=this;
       var segmentId;
       var campaignId;
       var campaignName;
       var data;
       try{
          segmentId = await self.getSegment(segmentName);
          console.local("segment id: ",segmentId);

          settings.title =  settings.title || "MoD "+(new Date()).toLocaleString('en-US',{
                                                 year:"numeric",
                                                 month:"long",
                                                 day:"numeric"});

          console.local("campaign name: "+campaignName);
          data = await self.mailchimp.campaigns.create({
             type: "regular",
             recipients:{
                list_id: self.listId,
                segment_opts:{
                   saved_segment_id: segmentId,
                },
             },
             settings:settings,
          });
          console.local("campaign data",data);
          campaignId = data.id;
          console.local("campaign id: ",campaignId);

          data = await self.mailchimp.campaigns.setContent(campaignId,{
             html: content,
          });
          console.local("set content result: ",data);

          data = await self.mailchimp.campaigns.send(campaignId);
          console.local("send campaign result: ",data);

       }catch(error){
          console.error("failed to send campaign to "+segmentName,error);
       }
       

    }
    async getAllMemberEmails(count=1000, offset=0){
        return await this.mailchimp.lists.getListMembersInfo(this.listId,{
            fields:["members.email_address"],
            count:count,
            offset:offset
        });
    }

}
