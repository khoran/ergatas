// DataAccess facade. Holds the only PostgrestClient instance privately (#client)
// and exposes the domain API two ways:
//   - namespaced:  da.users.getUser(...)   (preferred for new code)
//   - flat:        da.getUser(...)         (back-compat, via #bindFlat)
// The transport (#client) is unreachable from application code.
export * from './filters.js';                 // FilterAppender family stays importable via the shim

import { PostgrestClient } from './postgrest-client.js';

import { UsersRepo } from './repos/users-repo.js';
import { ProfilesRepo } from './repos/profiles-repo.js';
import { PostsRepo } from './repos/posts-repo.js';
import { SearchesRepo } from './repos/searches-repo.js';
import { OrganizationsRepo } from './repos/organizations-repo.js';
import { TransactionsRepo } from './repos/transactions-repo.js';
import { SubscriptionsRepo } from './repos/subscriptions-repo.js';
import { MessagesRepo } from './repos/messages-repo.js';
import { SavedSearchesRepo } from './repos/saved-searches-repo.js';
import { PagesRepo } from './repos/pages-repo.js';
import { PermissionsRepo } from './repos/permissions-repo.js';
import { ReferenceRepo } from './repos/reference-repo.js';
import { WorkerDocumentsRepo } from './repos/worker-documents-repo.js';

export class DataAccess {
    #client;

    /**
     * @param {baseURL for postgrest requests} postgrestBase
     * @param {a function compatible with jQuery.ajax} ajaxFn
     */
    constructor(postgrestBase,ajaxFn,refreshAuthFn){
        this.#client = new PostgrestClient(postgrestBase,ajaxFn,refreshAuthFn);

        this.users = new UsersRepo(this.#client);
        this.profiles = new ProfilesRepo(this.#client);
        this.posts = new PostsRepo(this.#client);
        this.searches = new SearchesRepo(this.#client);
        this.organizations = new OrganizationsRepo(this.#client);
        this.transactions = new TransactionsRepo(this.#client);
        this.subscriptions = new SubscriptionsRepo(this.#client);
        this.messages = new MessagesRepo(this.#client);
        this.savedSearches = new SavedSearchesRepo(this.#client);
        this.pages = new PagesRepo(this.#client);
        this.permissions = new PermissionsRepo(this.#client);
        this.reference = new ReferenceRepo(this.#client);
        this.workerDocs = new WorkerDocumentsRepo(this.#client);

        // flat back-compat API: da.getUser(...) keeps working
        this.#bindFlat([
            this.users, this.profiles, this.posts, this.searches,
            this.organizations, this.transactions, this.subscriptions,
            this.messages, this.savedSearches, this.pages,
            this.permissions, this.reference, this.workerDocs,
        ]);
    }
    #bindFlat(repos){
        for (const repo of repos)
            for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(repo))){
                if (name === 'constructor' || typeof repo[name] !== 'function') continue;
                if (this[name] !== undefined) throw new Error(`DataAccess: duplicate method ${name}`);
                this[name] = repo[name].bind(repo);     // `this` inside the method is the repo
            }
    }

    toString(){
        return "DataAccess Object";
    }
    setToken(token){
        this.#client.setToken(token);
    }
    isAuthenticated(){
        return this.#client.isAuthenticated();
    }
    dbReady(){
        return this.#client.dbReady();
    }
}
