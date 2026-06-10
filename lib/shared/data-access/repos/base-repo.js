// Common base for all domain repositories. Each repo gets the PostgrestClient
// by constructor injection and reaches the transport via `this.client.*`.
export class BaseRepo {
    constructor(client){
        this.client = client;
    }
}
