
import mailchimp  from "@mailchimp/mailchimp_marketing";
import crypto from 'crypto';

export class MailingList {
    constructor(key, serverURL){
        var self=this;

        mailchimp.setConfig({
            apiKey: key,
            server: serverURL,
        });

        self.mailchimp=mailchimp;



    }

    emailHash(email){
        return crypto.createHash("md5").update(email).digest("hex");
    }

    async removeUser(listId, email){
        var self=this;
        const emailHash = self.emailHash(email);
        const listMember=await self.mailchimp.lists.getListMember(listId,emailHash);
        const tagNames = listMember.tags.map( tag => tag.name);

        //console.local("removing user. tags: ",tagNames);
        // if user has only the single tag "User", then remove.
        // also remove it the only two tags are User and Missionary
        if( (tagNames.length === 1 && tagNames[0]==="User") || 
            (tagNames.length === 2 && tagNames.includes("User") && tagNames.includes("Missionary"))){
            await self.mailchimp.lists.deleteListMember(listId,emailHash);
        }
    }
    async createUser(listId,email){
        var self=this;
        await self.mailchimp.lists.addListMember(listId, {
                email_address:email,
                status:"subscribed",
            });
    }
    async ensureUser(listId,email){
        var self=this;
        if( ! await self.userExists(listId,email))
            await self.createUser(listId,email);
    }
    async addTags(listId,email,tags){
        var self=this;
        //console.local(`adding tags to list id ${listId}, email ${email} tags: `,tags);

        await self.mailchimp.lists.updateListMemberTags(listId,self.emailHash(email),{ 
            tags: tags.map( tag =>{
                return {name:tag,
                        status:"active"};
            })
        });
    }
    async addToGroup(listId,email,group){
        var self=this;
        console.local(`adding group to list id ${listId}, email ${email} group: `,group);
        //in mailchimp, groups and interests are the same thing
       

        // find interest category named 'Interests'
        var categories = await self.mailchimp.lists.getListInterestCategories(listId);
        console.local("categories: ",categories);

        var interestsCatagory = categories.categories.find(cat => cat.title === "Interests");
        
        if(interestsCatagory == null){
           console.error(`no 'Interests' category found, could not add ${email} to group ${group}`);
           return;
        }


        // find given group within category
        var interests = await self.mailchimp.lists.listInterestCategoryInterests(listId,interestsCatagory.id);
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
        await self.mailchimp.lists.updateListMember(listId,self.emailHash(email),data);
    }
    async setUserName(listId,email,firstName,lastName){
        var self=this;

        await self.mailchimp.lists.updateListMember(listId,self.emailHash(email),{
            merge_fields:{
                FNAME:firstName,
                LNAME:lastName
            }
        });
    }

    async userExists(listId,email){
        var self=this;
        try{
            await self.mailchimp.lists.getListMember(listId,self.emailHash(email));
            return true;
        }catch(error){
            return false;
        }
    }

}
