import { BaseRepo } from './base-repo.js';
import * as H from '../headers.js';
import * as shape from '../shape.js';

export class OrganizationsRepo extends BaseRepo {
    getOrganization(organization_key){
        return this.client.retry(3,async () =>{
            var data = await this.client.get("/non_profit_and_organizations_view?organization_key=eq."+organization_key,H.single());
            return shape.updateNonProfitFields(data);

        });
    }
    getPlainOrganization(organization_key){
        return this.client.retry(3,async () =>{
            return await this.client.get("/organizations_view?organization_key=eq."+organization_key,H.single());
        });
    }
    getNonProfit(non_profit_key){
        return this.client.retry(3,async () =>{
            var data = await this.client.authGet("/non_profits_view?non_profit_key=eq."+non_profit_key,H.single());
            return shape.updateNonProfitFields(data);
        });
    }
    getOrganizationBySlug(slug){
        return this.client.retry(3,async () =>{
            var data = await this.client.get("/non_profit_and_organizations_view?slug=eq."+slug,H.single());
            return shape.updateNonProfitFields(data);
        });
    }
    createNonProfitOrganization(data){
        return this.client.retry(3,async () =>{
            return await this.client.authPost("/non_profit_and_organizations_view",data,
                                    H.single(H.representation()));
        });

    }
    createOrganization(data){
        return this.client.retry(3,async () =>{
            return await this.client.authPost("/organizations_view",data,
                                    H.single(H.representation()));
        });

    }

    newOrganization(){
        return this.client.retry(3,async () =>{
            var record= await this.client.get("/new_organization",H.single());
            record = record.data;
            record.organization_key=undefined;
            return record;
        });
    }
    unapprovedOrganizationStatus(country_org_id,country_code="usa"){
        return this.client.retry(3,async () =>{
            return await this.client.get("/non_profit_and_organizations_view?status=not.eq.approved&country_org_id=eq."+country_org_id+
                                        "&country_code=eq."+country_code);
        });
    }
    updateOrganization(organization_key,data){
        return this.client.retry(3, async ()=>{
            return await this.client.authPatch("/organizations_view?organization_key=eq."+organization_key,
                data);
        });
    }
    updateNonProfit(non_profit_key,data){
        return this.client.retry(3, async ()=>{
            return await this.client.authPatch("/non_profits_view?non_profit_key=eq."+non_profit_key,
                data);
        });
    }

    deleteOrganization(organization_key){

    }
    // Authenticated org reads/writes (used under the server role by worker-documents).
    getOrg(organization_key){
        return this.client.retry(3,async () =>{
            return await this.client.authGet(
                '/organizations_view?organization_key=eq.' + organization_key,
                H.single()
            );
        });
    }
    listAllOrgs(){
        return this.client.retry(3,async () =>{
            return await this.client.authGet('/organizations_view');
        });
    }
    updateOrg(organization_key,data){
        return this.client.retry(3,async () =>{
            return await this.client.authPatch(
                '/organizations_view?organization_key=eq.' + organization_key,
                data
            );
        });
    }
    organizationList(){
        return this.client.retry(3,async () =>{
            return this.client.get("/non_profit_and_organizations_view?status=eq.approved&order=display_name");
        });
    }
    allOrganizations(){
        return this.client.retry(3,async () =>{
            return this.client.get("/organizations_view?order=name");
        });
    }
    sendingOrganizationList(){
        return this.client.retry(3,async () =>{
            return this.client.get("/non_profit_and_organizations_view?status=eq.approved&is_sending_org=eq.true&order=display_name");
        });
    }
    organizationsNeedingReview(){
        return this.client.retry(3,async () =>{
            return this.client.authGet("/pending_organizations_view");
        });
    }
    setOrganizationApprovalStatus(organization_key,status){
        return this.client.retry(3,async () =>{
            return this.client.authPatch("/pending_organizations_view?organization_key=eq."+organization_key,
                    {status:status});
        });

    }
    insertOrganizationListener(organization_key,user_key){
        return this.client.retry(3,async () =>{
            return this.client.authPost("/organization_listeners_view?on_conflict=organization_key,user_key",
                    {organization_key: organization_key, user_key,user_key}, H.ignoreDups());
        });
    }
    selectOrganizationListeners(organization_key){
        return this.client.retry(3,async () =>{
            return this.client.authGet("/organization_users_to_notify?organization_key=eq."+organization_key);
        });

    }
    deleteOrganizationListeners(organization_key){
        return this.client.retry(3,async () =>{
            return this.client.authDelete("/organization_listeners_view?organization_key=eq."+organization_key);
        });

    }
    selectOrganizationsWithProfiles(){
        return this.client.retry(3,async () =>{
            return this.client.get("/organizations_with_profiles?order=name");
        });

    }
}
