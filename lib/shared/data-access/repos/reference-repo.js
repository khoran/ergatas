import { BaseRepo } from './base-repo.js';
import * as H from '../headers.js';

export class ReferenceRepo extends BaseRepo {
    // MISC
    jobList(){
        return this.client.retry(3,async () =>{
            return this.client.get("/job_catagories_view?order=catagory");
        });
    }
    featuredProfiles(){
        return this.client.retry(3,async () =>{
            //return this.dbGet("/featured_profiles");
            return this.client.get("/random_profiles?limit=3");
        });
    }
    randomSharableProfile(){
        return this.client.retry(3,async () =>{
            // return 1 random profile where limit_social_media is either false or not set
            return this.client.get("/random_profiles?limit=1&"+
                "or=(data->>limit_social_media.eq.false,data->>limit_social_media.is.null)",H.single());
        });
    }
    tagList(){
        return this.client.retry(3,async () =>{
            return this.client.get("/tags_view?order=name");
        });
    }
    causeList(){
        return this.client.retry(3,async () =>{
            return this.client.get("/causes_view?order=cause");
        });
    }
    causeCounts(){
        return this.client.retry(3,async () =>{
            return this.client.get("/cause_counts_view");
        });
    }
    jobCounts(){
        return this.client.retry(3,async () =>{
            return this.client.get("/job_counts_view");
        });
    }
    tagCounts(){
        return this.client.retry(3,async () =>{
            return this.client.get("/tag_counts_view");
        });
    }

    peopleGroupsWithWorkers(){
        return this.client.retry(3,async () =>{
            return this.client.get("/people_groups_with_workers");
        });
    }
    countriesWithWorkers(){
        return this.client.retry(3,async () =>{
            return this.client.get("/countries_with_workers");
        });
    }
}
