import { BaseRepo } from './base-repo.js';
import * as H from '../headers.js';

// Worker review-document reads/writes used by lib/server/worker-documents.js.
// These run under the server role (getServerDB), so all calls are authenticated.
export class WorkerDocumentsRepo extends BaseRepo {
    insertDocument(record){
        return this.client.retry(3,async () =>{
            return await this.client.authPost('/worker_documents_view', record);
        });
    }
    getDocument(worker_document_key){
        return this.client.retry(3,async () =>{
            return await this.client.authGet(
                `/worker_documents_view?worker_document_key=eq.${worker_document_key}`,
                H.single()
            );
        });
    }
    listDocumentsForProfile(missionary_profile_key){
        return this.client.retry(3,async () =>{
            return await this.client.authGet(
                `/worker_documents_view?missionary_profile_key=eq.${missionary_profile_key}&order=submission_period.desc`
            );
        });
    }
    getDocumentForPeriod(missionary_profile_key,document_type,submission_period){
        return this.client.retry(3,async () =>{
            return await this.client.authGet(
                `/worker_documents_view?missionary_profile_key=eq.${missionary_profile_key}&document_type=eq.${document_type}&submission_period=eq.${submission_period}`
            );
        });
    }
    listDocumentsForProfiles(profileKeys,submission_period){
        let docFilter = `/worker_documents_view?missionary_profile_key=in.(${profileKeys.join(',')})`;
        if (submission_period) docFilter += `&submission_period=eq.${submission_period}`;
        return this.client.retry(3,async () =>{
            return await this.client.authGet(docFilter);
        });
    }
    deleteDocument(worker_document_key){
        return this.client.retry(3,async () =>{
            return await this.client.authDelete(
                `/worker_documents_view?worker_document_key=eq.${worker_document_key}`
            );
        });
    }

    // Resolve any open reminder for a (profile, type, period).
    resolveOpenReminder(missionary_profile_key,document_type,submission_period,resolved_on){
        return this.client.retry(3,async () =>{
            return await this.client.authPatch(
                `/worker_document_reminders_view?missionary_profile_key=eq.${missionary_profile_key}&document_type=eq.${document_type}&submission_period=eq.${submission_period}&resolved_on=is.null`,
                { resolved_on: resolved_on }
            );
        });
    }
    listUnresolvedRemindersForProfiles(profileKeys){
        return this.client.retry(3,async () =>{
            return await this.client.authGet(
                `/worker_document_reminders_view?missionary_profile_key=in.(${profileKeys.join(',')})&resolved_on=is.null`
            );
        });
    }
    listRemindersForPeriod(missionary_profile_key,document_type,submission_period){
        return this.client.retry(3,async () =>{
            return await this.client.authGet(
                `/worker_document_reminders_view?missionary_profile_key=eq.${missionary_profile_key}&document_type=eq.${document_type}&submission_period=eq.${submission_period}`
            );
        });
    }
    updateReminder(worker_document_reminder_key,data){
        return this.client.retry(3,async () =>{
            return await this.client.authPatch(
                `/worker_document_reminders_view?worker_document_reminder_key=eq.${worker_document_reminder_key}`,
                data
            );
        });
    }
    insertReminder(record){
        return this.client.retry(3,async () =>{
            return await this.client.authPost('/worker_document_reminders_view', record);
        });
    }
}
