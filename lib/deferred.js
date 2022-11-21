"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Deferred = void 0;
class Deferred {
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
        });
    }
    resolve(v) {
        this.resolvePromise(v);
    }
    reject(e) {
        this.rejectPromise(e);
    }
    toPromise() {
        return this.promise;
    }
}
exports.Deferred = Deferred;
