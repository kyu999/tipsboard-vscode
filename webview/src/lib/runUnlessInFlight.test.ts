import { describe, expect, it } from "vitest";

import { runUnlessInFlight } from "./runUnlessInFlight";

/**
 * 低スペック PC や遅いディスクを「そのまま」再現はできない（GPU・AV・OS の挙動は別物）。
 * ここでは I/O / RPC が遅いときの async 形状だけを setTimeout で擬似し、
 * 連打や重なった非同期でも runUnlessInFlight が破綻しないことを確認する。
 */
describe("runUnlessInFlight (slow async simulation)", () => {
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  it("runs the work function and clears inFlight after slow resolution", async () => {
    const ref = { current: false };
    const out = await runUnlessInFlight(ref, async () => {
      await delay(20);
      return 42;
    });
    expect(out).toBe(42);
    expect(ref.current).toBe(false);
  });

  it("second call while first is still in flight returns undefined and does not run inner fn", async () => {
    const ref = { current: false };
    let innerRuns = 0;

    const p1 = runUnlessInFlight(ref, async () => {
      innerRuns += 1;
      await delay(40);
      return "first";
    });

    await delay(5);
    const p2 = runUnlessInFlight(ref, async () => {
      innerRuns += 1;
      return "second";
    });

    expect(await p2).toBeUndefined();
    expect(await p1).toBe("first");
    expect(innerRuns).toBe(1);
    expect(ref.current).toBe(false);
  });

  it("allows a new call after the previous slow call finished", async () => {
    const ref = { current: false };
    const first = await runUnlessInFlight(ref, async () => {
      await delay(15);
      return 1;
    });
    const second = await runUnlessInFlight(ref, async () => {
      await delay(15);
      return 2;
    });
    expect(first).toBe(1);
    expect(second).toBe(2);
  });
});
