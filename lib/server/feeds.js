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
            image_url:this.urlBase+"/img/sharing-image.png",
            ttl:10080, // 1 week
        }
        this.commonOptions = commonOptions;
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
    // Build the scheduled social-media-posts feed on the fly from DB records
    // (manually curated, unlike the in-memory feeds above). `posts` are the
    // records due today, as returned by da.getDueSocialMediaPosts().
    // Items intentionally carry no <title>; the consumer posts the description only.
    socialPostsXml(posts){
        const feed = new RSS(Object.assign({},this.commonOptions,{
            title:"Ergatas Social Media Posts",
            description:"Scheduled social media posts from Ergatas.",
            feed_url:this.urlBase+"/feeds/posts",
        }));
        (posts||[]).forEach( post => feed.item(this.socialPostItemOptions(post)) );
        const xml = feed.xml({indent:true});
        // rss-generator always emits an item <title>, defaulting to the literal "No title"
        // when none is given, so strip those lines to leave the items title-less.
        return xml.replace(/^[ \t]*<title><!\[CDATA\[No title\]\]><\/title>\r?\n/gm, "");
    }
    socialPostItemOptions(post){
        const data = post.data || {};
        // Link to the post's own sharing page rather than link_url directly: X and
        // Facebook build the preview card by scraping the linked page's og/twitter
        // tags (they ignore the enclosure), so linking straight to the home page
        // gave every post the site-wide sharing image. The sharing page carries
        // this post's image and sends human visitors on to link_url.
        const options = {
            description: data.description,
            url: this.socialPostUrl(post),
            guid: String(post.social_media_post_key),
            date: post.post_date,
        };
        const imageUrl = this.socialPostImageUrl(post);
        if(imageUrl != null){
            options.enclosure = { url: imageUrl };
        }
        return options;
    }

    socialPostUrl(post){
        return this.urlBase+"/social-post/"+post.social_media_post_key;
    }
    // where a visitor following the post ends up
    socialPostTargetUrl(post){
        const data = post.data || {};
        return /^https?:\/\//i.test(data.link_url || "") ? data.link_url : this.urlBase;
    }
    socialPostImageUrl(post){
        const data = post.data || {};
        // posts without an image of their own carry the text card generated for
        // them in the dashboard (lib/shared/social-post-image.js)
        const imageUrl = (data.image_url != null && data.image_url !== "")
            ? data.image_url
            : data.generated_image_url;
        return (imageUrl != null && imageUrl !== "") ? imageUrl : null;
    }
    // Minimal page scraped by X/Facebook for a post's link preview. og:url points
    // back at this page (not link_url) so Facebook doesn't follow it to the target
    // and pick up that page's image instead. Crawlers don't run JS, so the
    // redirect only affects people.
    socialPostHtml(post){
        const data = post.data || {};
        const esc = text => String(text)
            .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
        const title = (data.title != null && data.title !== "") ? data.title : "Ergatas";
        const description = data.description || "";
        const pageUrl = this.socialPostUrl(post);
        const target = this.socialPostTargetUrl(post);
        const image = this.socialPostImageUrl(post) || this.commonOptions.image_url;
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Ergatas">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${esc(pageUrl)}">
    <meta property="og:image" content="${esc(image)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${esc(image)}">
    <script>window.location.replace(${JSON.stringify(target).replace(/</g,"\\u003c")});</script>
</head>
<body>
    <p>${esc(description)}</p>
    <p><a href="${esc(target)}">Continue to ${esc(target)}</a></p>
</body>
</html>`;
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
