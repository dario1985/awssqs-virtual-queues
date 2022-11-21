export class Deferred<T> {
  private readonly promise: Promise<T>;

  private resolvePromise!: (v: T) => void;
  private rejectPromise!: (e?: any) => void;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  resolve(v: T) {
    this.resolvePromise(v);
  }

  reject(e?: any) {
    this.rejectPromise(e);
  }

  toPromise() {
    return this.promise;
  }
}
