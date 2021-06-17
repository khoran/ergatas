
import axios from 'axios';
import { AppError } from './app-error.js';
import {rankedMatches} from '../shared/shared-utils.js';

export class JoshuaProject{
    constructor(apiKey,v2Base){
        this.apiKey = apiKey;
        this.urlBase = v2Base;

        this.refresh();

    }
    async refresh(){

        this.peopleGroupPromise = this.downloadPeopleGroups();
        this.languagePromise = this.downloadLanguages();
        return Promise.all([this.peopleGroupPromise,this.languagePromise]);
    }
    async withPeopleGroupData(f){
        return this.peopleGroupPromise.then(f);
    }
    async withLanguageData(f){
        return this.languagePromise.then(f);
    }
    async peopleGroupSearch(query,limit) {
        try{
            var pgNames = await this.peopleGroupPromise;
            if(pgNames != null)
                return rankedMatches(query,pgNames,[
                    "PeopNameInCountry",
                    "PeopNameAcrossCountries",
                    "PeopleCluster",
                ]).slice(0,limit);
            else{
                console.warn("in peopleGroupSearch, pgNames was null");
                return [];

            }
        }catch(error){
            console.error("failed to search for people groups: ",error);
            throw new AppError("failed to search for people groups: "+error);
        }
    }
    async peopleGroupNames(peopleID3Codes) {
        try{
            var pgNames = await this.peopleGroupPromise;
            return peopleID3Codes.map(code => pgNames[code]);
        }catch(error){
            console.error("failed to convert peopleID3 codes to names: ",error);
            throw new AppError("failed to convert peopleID3 codes to names: "+error);
        }
    }

    async downloadPeopleGroups(){

        const urlRoot = process.env.JOSHUA_PROJECT_API_ROOT;
        const key =process.env.JOSHUA_PROJECT_API_KEY;
        var url = urlRoot+`people_groups?api_key=${key}`
        var peopleGroups;
        var nameData={};
        var fieldsToKeep = ["PeopleID3", "PeopNameInCountry",
                            "PeopleCluster","PeopNameAcrossCountries",
                            "Frontier" ];
        try{
            console.local("starting people group download...");
            url = url+"&fields="+fieldsToKeep.join("|");
            console.local("final url: ",url);

            peopleGroups = await this.fetchAllPages(url);
            console.info("people group download done. got "+peopleGroups.length+" records");
            console.local(peopleGroups[0]);

            peopleGroups.forEach( group => {
                //people groups can be repeated for different countries.
                // here we just care if any of them are Frontier (1 or more)
                if(nameData[group.PeopleID3] != null) { //already exists
                    if(group.Frontier === "Y")
                        nameData[group.PeopleID3].Frontier = group.Frontier;
                }else
                    nameData[group.PeopleID3] = group;
            });
            //console.local("found "+Object.values(nameData).length+" distinct people groups");
            return nameData;

        }catch(error){
            console.error("error fetching people group data: "+error.message,error);
        }


    }
    async languageSearch(query,limit) {
        try{
            var names = await this.languagePromise;
            if(names != null)
                return rankedMatches(query,names,["Language"]).slice(0,limit);
            else{
                console.warn("in languageSearch, names was null");
                return [];
            }
        }catch(error){
            console.error("failed to search for languages: ",error);
            throw new AppError("failed to search for languages: "+error);
        }
    }
    async languageNames(rol3Codes) {
        try{

            var names = await this.languagePromise;
            return rol3Codes.map(code => names[code]);
        }catch(error){
            console.error("failed to convert rol3 codes to names: ",error);
            throw new AppError("failed to convert rol3 codes to names: "+error);
        }
    }
    async downloadLanguages(){

        var url = this.urlBase+`languages?api_key=${this.apiKey}`;
        var languages;
        var nameData={};
        var fieldsToKeep = ["ROL3","Language"];
        try{
            console.local("starting language download...");

            url = url+"&fields="+fieldsToKeep.join("|");

            languages = await this.fetchAllPages(url);

            console.info("languages download done. got "+languages.length+" records");

            languages.forEach( lang => {
                nameData[lang.ROL3] = lang;
            });
            return nameData;

        }catch(error){
            console.error("error fetching language data: "+error.message,error);
        }
    }
    async fetchAllPages(url){
        var allData;
        var pageData;

        url = url+"&limit=3000";

        pageData = (await axios.get(url)).data;
        allData = pageData.data;
        if(pageData.meta != null && pageData.meta.pagination){
            var numPages = pageData.meta.pagination.total_pages;
            for(var page = 2; page <= numPages; page++){
                //console.local("fetching page "+page);
                pageData = (await axios.get(url+"&page="+page)).data;
                allData = allData.concat(pageData.data);
            }
        }else{
            console.error("no meta data found for JoshuaProject response. results may be incomplete");
        }

        //console.info("fetched "+allData.length+" records");

        return allData;
 
    }
    async frontierPeopleGroupIds(){
        var data = await this.peopleGroupPromise

        
        console.local("found "+Object.values(data).length+" people groups");
        var ids = Object.values(data).filter( pg => pg.Frontier=== "Y").
                map(pg => pg.PeopleID3);

        console.local("found "+ids.length+" frontier people groups");

        return ids;
    }

}