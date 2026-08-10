import { BaseRepo } from './base-repo.js';
import * as H from '../headers.js';

export class ReferenceRepo extends BaseRepo {
    // MISC
    jobList(){
        return this.run(async () =>{
            return this.client.get("/job_catagories_view?order=catagory");
        });
    }
    featuredProfiles(){
        return this.run(async () =>{
            //return this.dbGet("/featured_profiles");
            return this.client.get("/random_profiles?limit=3");
        });
    }
    randomSharableProfile(){
        return this.run(async () =>{
            // return 1 random profile where limit_social_media is either false or not set
            return this.client.get("/random_profiles?limit=1&"+
                "or=(data->>limit_social_media.eq.false,data->>limit_social_media.is.null)",H.single());
        });
    }
    tagList(){
        return this.run(async () =>{
            return this.client.get("/tags_view?order=name");
        });
    }
    causeList(){
        return this.run(async () =>{
            return this.client.get("/causes_view?order=cause");
        });
    }
    causeCounts(){
        return this.run(async () =>{
            return this.client.get("/cause_counts_view");
        });
    }
    jobCounts(){
        return this.run(async () =>{
            return this.client.get("/job_counts_view");
        });
    }
    tagCounts(){
        return this.run(async () =>{
            return this.client.get("/tag_counts_view");
        });
    }

    currencyCounts(){
        return this.run(async () =>{
            return this.client.get("/currency_counts_view?order=currency");
        });
    }
    peopleGroupsWithWorkers(){
        return this.run(async () =>{
            return this.client.get("/people_groups_with_workers");
        });
    }
    countriesWithWorkers(){
        return this.run(async () =>{
            return this.client.get("/countries_with_workers");
        });
    }
    impactCountriesWithWorkers(){
        return this.run(async () =>{
            return this.client.get("/impact_countries_with_workers");
        });
    }
}
