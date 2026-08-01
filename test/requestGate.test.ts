import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestGate } from "../src/shared/http/requestGate.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("RequestGate", () => {
  it("spaces request starts without allowing a burst", async () => {
    vi.useFakeTimers();
    const gate = new RequestGate({
      maxConcurrency: 2,
      minIntervalMs: 200,
      maxQueue: 2,
    });
    const signal = new AbortController().signal;
    const releaseFirst = await gate.acquire(signal);
    let secondStarted = false;
    const second = gate.acquire(signal).then((release) => {
      secondStarted = true;
      return release;
    });

    await vi.advanceTimersByTimeAsync(199);
    expect(secondStarted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const releaseSecond = await second;
    expect(secondStarted).toBe(true);

    releaseFirst();
    releaseFirst();
    releaseSecond();
  });

  it("removes a cancelled waiter from the queue", async () => {
    const gate = new RequestGate({
      maxConcurrency: 1,
      minIntervalMs: 0,
      maxQueue: 2,
    });
    const release = await gate.acquire(new AbortController().signal);
    const controller = new AbortController();
    const waiting = gate.acquire(controller.signal);
    controller.abort();

    await expect(waiting).rejects.toMatchObject({ kind: "CANCELLED" });
    release();
    const nextRelease = await gate.acquire(new AbortController().signal);
    nextRelease();
  });
});
