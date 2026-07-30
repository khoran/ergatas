// Common base for all domain repositories. Each repo gets the PostgrestClient
// by constructor injection and reaches the transport via `this.client.*`.
export class BaseRepo {
    constructor(client){
        this.client = client;
    }
    // Run an async transport operation with the standard retry policy. Repos call
    // this.run(async () => …) instead of repeating this.client.retry(3, …) in
    // every method.
    run(fn){
        return this.client.retry(3,fn);
    }
}
