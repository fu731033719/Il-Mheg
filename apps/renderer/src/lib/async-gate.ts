export class AsyncGate {
  private active?: Promise<void>;

  run(task: () => void | Promise<void>): Promise<void> {
    if (this.active) return this.active;
    const promise = Promise.resolve().then(task);
    this.active = promise;
    const clear = () => { if (this.active === promise) this.active = undefined; };
    void promise.then(clear, clear);
    return promise;
  }
}
