import { BaseRepo } from './base-repo.js';
import * as H from '../headers.js';
import * as shape from '../shape.js';

export class TransactionsRepo extends BaseRepo {
    // possible transactions
    insertPossibleTransaction(missionary_profile_key,amount,type,stripe_id,confirmed,donor_key){
        return this.client.retry(3,async () =>{
            if(stripe_id == null)
                return this.client.post("/possible_transactions_view",
                    {
                        missionary_profile_key: missionary_profile_key,
                        amount: amount,
                        donation_type: type,
                    }, H.minimal());
            else
                return this.client.authPost("/possible_transactions_view",
                    {
                        missionary_profile_key: missionary_profile_key,
                        amount: amount,
                        donation_type: type,
                        stripe_id: stripe_id,
                        donor_key: donor_key,
                        confirmed:confirmed,
                    },H.single(H.representation()));

        });
    }
    getPossibleTransaction(possible_transaction_key){
        return this.client.retry(3,async () =>{
            return this.client.authGet("/possible_transactions_view?possible_transaction_key=eq."+possible_transaction_key,
                H.single());
        });
    }
    getPossibleTransactionByStripeId(stripe_id){
        return this.client.retry(3,async () =>{
            return shape.singleOrNone(await this.client.authGet("/possible_transactions_view?stripe_id=eq."+stripe_id));
        });
    }
    updatePossibleTransaction(possible_transaction_key,data){
        return this.client.retry(3,async () =>{
            return this.client.authPatch("/possible_transactions_view?possible_transaction_key=eq."+possible_transaction_key, data);
        });
    }
    confirmTransaction(possible_transaction_key){
        //TODO: need more permissions

    }
    getAllStripeTransactions(){
        return this.client.retry(3,async () =>{
            return this.client.authGet("/donations_view?stripe_id=not.is.null");
        });
    }
    getWorkerTransaction(possible_transaction_key){
        //like getPossibleTransaction, but ensures logged in user has permission on this tx
        return this.client.retry(3,async () =>{
            return this.client.authGet("/workers_donations?possible_transaction_key=eq."+possible_transaction_key);
        });
    }
    getWorkerTransactions(){
        return this.client.retry(3,async () =>{
            // this view only shows records that belong to logged in user. so don't need to filter.
            return this.client.authGet("/workers_donations");
        });
    }
    // email hashes
    insertEmailHashMapping(emailAddress,hashedEmail){
        return this.client.retry(3,async()=>{
            return this.client.authPost("/email_hashes_view?on_conflict=email_address",{
                email_address:emailAddress,
                hashed_email_address:hashedEmail
            },H.ignoreDups());
        });
    }
    getEmailHash(hashedEmail){
        return this.client.retry(3,async()=>{
            return this.client.authGet("/email_hashes_view?hashed_email_address=eq."+hashedEmail, H.single());
        });
    }

    getDonors(){
        return this.client.retry(3,async()=>{
            return this.client.authGet("/donors_view");
        });
    }
    getDonor(donor_key){
        return this.client.retry(3,async()=>{
            return this.client.authGet("/donors_view?donor_key=eq."+donor_key, H.single());
        });
    }
    getDonorByCustomerId(stripe_customer_id){
        return this.client.retry(3,async()=>{
            return shape.singleOrNone(await this.client.authGet("/donors_view?stripe_customer_id=eq."+stripe_customer_id));
        });
    }
    insertDonor(donor){
        return this.client.retry(3,async()=>{
            return this.client.authPost("/donors_view",donor,
                    H.single(H.representation()));
        });
    }
    updateDonor(donor_key,donor){
        return this.client.retry(3,async()=>{
            return this.client.authPatch("/donors_view?donor_key=eq."+donor_key,donor);
        });
    }
}
