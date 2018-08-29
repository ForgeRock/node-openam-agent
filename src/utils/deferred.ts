export class Deferred<R = any> {
  promise: Promise<R>;
  resolve: (result: R) =>  any;
  reject: (error: any) =>  any;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}
