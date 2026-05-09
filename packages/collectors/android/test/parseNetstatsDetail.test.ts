import { describe, expect, it } from "vitest";
import {
  calculateUidNetworkDelta,
  parseNetstatsDetailForUid
} from "../src/parsers/parseNetstatsDetail";
import { readAndroidFixture } from "./fixture";

describe("parseNetstatsDetailForUid", () => {
  it("parses target uid and accumulates mobile plus wifi records", () => {
    const snapshot = parseNetstatsDetailForUid(
      readAndroidFixture("dumpsys_netstats_detail_uid_sample.txt"),
      10123
    );

    expect(snapshot).toMatchObject({
      uid: 10123,
      rxBytes: 12000,
      txBytes: 5000,
      rxPackets: 120,
      txPackets: 50,
      bucketCount: 2
    });
    expect(snapshot?.identities?.length).toBe(2);
  });

  it("ignores other uids and returns null when target uid is absent", () => {
    const multi = parseNetstatsDetailForUid(
      readAndroidFixture("dumpsys_netstats_detail_multi_uid_sample.txt"),
      10123
    );
    expect(multi?.rxBytes).toBe(300);
    expect(multi?.txBytes).toBe(400);
    expect(
      parseNetstatsDetailForUid(readAndroidFixture("dumpsys_netstats_detail_no_uid_sample.txt"), 10123)
    ).toBeNull();
  });

  it("records malformed line warnings and calculates deltas/rates", () => {
    const malformed = parseNetstatsDetailForUid(
      readAndroidFixture("dumpsys_netstats_detail_malformed_sample.txt"),
      10123
    );
    expect(malformed?.warnings.length).toBeGreaterThan(0);
    expect(malformed?.rxBytes).toBe(200);

    const first = parseNetstatsDetailForUid(
      readAndroidFixture("dumpsys_netstats_detail_uid_sample.txt"),
      10123
    )!;
    const second = parseNetstatsDetailForUid(
      readAndroidFixture("dumpsys_netstats_detail_uid_sample_2.txt"),
      10123
    )!;
    expect(calculateUidNetworkDelta(first, second, 1000)).toMatchObject({
      rxBytes: 4500,
      txBytes: 2800,
      rxRateBytesPerSecond: 4500,
      txRateBytesPerSecond: 2800
    });
    expect(calculateUidNetworkDelta(second, first, 1000)).toBeNull();
  });
});
