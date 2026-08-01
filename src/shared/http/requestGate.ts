import { DomainApiError } from "./errors.js";

type Waiter = {
  resolve: (release: () => void) => void;
  reject: (error: DomainApiError) => void;
  signal: AbortSignal;
  onAbort: () => void;
};

export type RequestGateOptions = {
  maxConcurrency: number;
  minIntervalMs: number;
  maxQueue: number;
  now?: () => number;
};

export class RequestGate {
  private readonly maxConcurrency: number;
  private readonly minIntervalMs: number;
  private readonly maxQueue: number;
  private readonly now: () => number;
  private readonly queue: Waiter[] = [];
  private active = 0;
  private lastStartedAt = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: RequestGateOptions) {
    this.maxConcurrency = options.maxConcurrency;
    this.minIntervalMs = options.minIntervalMs;
    this.maxQueue = options.maxQueue;
    this.now = options.now ?? Date.now;
  }

  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) {
      return Promise.reject(this.cancelledError());
    }

    if (this.queue.length >= this.maxQueue) {
      return Promise.reject(
        new DomainApiError({
          kind: "OVERLOADED",
          message: "BCRA request queue is full",
          source: "bcra",
        }),
      );
    }

    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        signal,
        onAbort: () => {
          const index = this.queue.indexOf(waiter);
          if (index >= 0) {
            this.queue.splice(index, 1);
            reject(this.cancelledError());
          }
        },
      };

      signal.addEventListener("abort", waiter.onAbort, { once: true });
      this.queue.push(waiter);
      this.drain();
    });
  }

  private drain(): void {
    if (this.active >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const waitMs = Math.max(0, this.lastStartedAt + this.minIntervalMs - this.now());
    if (waitMs > 0) {
      if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = undefined;
          this.drain();
        }, waitMs);
      }
      return;
    }

    const waiter = this.queue.shift();
    if (!waiter) {
      return;
    }

    waiter.signal.removeEventListener("abort", waiter.onAbort);
    if (waiter.signal.aborted) {
      waiter.reject(this.cancelledError());
      this.drain();
      return;
    }

    this.active += 1;
    this.lastStartedAt = this.now();
    let released = false;
    waiter.resolve(() => {
      if (released) {
        return;
      }
      released = true;
      this.active -= 1;
      this.drain();
    });

    this.drain();
  }

  private cancelledError(): DomainApiError {
    return new DomainApiError({
      kind: "CANCELLED",
      message: "BCRA API request was cancelled",
      source: "bcra",
    });
  }
}
