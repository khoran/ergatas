import RSS from 'rss-generator';
export class Feeds{
    constructor(){
        const bucketName = process.env.UPLOAD_BUCKET;
        const bucketBaseUrl= process.env.BUCKET_BASE_URL;
        this.domain = process.env.DOMAIN;
        this.bucketBase=bucketBaseUrl+"/"+bucketName+"/";

        this.tags = "#bible #christianity #missions #ergatas"


        this.urlBase="https://"+this.domain;
        const commonOptions = {
            site_url:this.urlBase,
            image_url:this.urlBase+"/img/sharing-image.jpg",
            ttl:10080, // 1 week
        }
        const missionaryOfTheDayOptions = Object.assign({},commonOptions,
            {
                title:"Missionary of the Day",
                description:"Learn about a missionary, pray for them, partner with them.",
                feed_url:this.urlBase+"/feeds/missionaryOfTheDay",
            });
        const newMissionariesOptions = Object.assign({},commonOptions,
            {
                title:"New Missionaries",
                description:"New missionaries to learn about, pray for, and partner with.",
                feed_url:this.urlBase+"/feeds/newMissionaries",
            });

        this.missionaryOfTheDay = new RSS(missionaryOfTheDayOptions);
        this.newMissionaries = new RSS(newMissionariesOptions);

    }

    addRandomMissionary(profile) {
        this.missionaryOfTheDay.item(this.profileItemOptions("",profile, this.tags));
    }
    addNewMissionary(profile){
        this.newMissionaries.item(this.profileItemOptions("New Missionary on Ergatas!",profile,this.tags,profile.created_on));
    }

    xml(feedName){
        return this[feedName].xml({indent:true});
    }
    headItem(feedName){
       var items = this[feedName].items;
       console.local("items: ",items[items.length-1]);
      return items[items.length-1];
    }

    profileItemOptions(prefix,profile,hashtags,date=new Date()){
        var self=this;
        const options = {
            title: `Meet ${profile.missionary_name}`,
            description: prefix+` Learn about the ministry of ${profile.missionary_name}.`+
                " Pray for them. If you feel a connection with their ministry, consider partnering with them. "+hashtags,
            url:this.urlBase+"/profile-detail/"+profile.missionary_profile_key,
            guid: profile.missionary_profile_key,
            date: date,
            author: profile.missionary_name,
            lat: profile.data.location_lat,
            long: profile.data.location_long,
        };

        options.title= options.description; //feed for facebook refuses to use description for some reason

        if(profile.data.picture_url != null && profile.data.picture_url !== ""){
            options.enclosure= {
                url: this.bucketBase+profile.data.picture_url,
            };
        }
        //console.local("from profile ",profile);
        console.local("created feed options: ",options);
        return options;
    }
    trim(){
        const maxSize = 100;
        const self=this;
        const feeds = ["missionaryOfTheDay","newMissionaries"];
        feeds.forEach( feedName =>{
            const feed = self[feedName];
            if(feed.items.length > maxSize){
                console.info("trimming feed "+feedName+", current length: "+feeds.items.length);
                feed.items = feeds.items.slice(-1 * maxSize);
            }
        })    
    }

}
