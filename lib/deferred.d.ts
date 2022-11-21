export declare class Deferred<T> {
    private readonly promise;
    private resolvePromise;
    private rejectPromise;
    constructor();
    resolve(v: T): void;
    reject(e?: any): void;
    toPromise(): Promise<T>;
}
