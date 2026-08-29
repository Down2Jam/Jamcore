import { describe, expect, it } from "vitest";

import {
  calculateLoudnessGainDb,
  parseLoudnormOutput,
} from "../src/features/uploads/audio-loudness.js";

describe("audio loudness", () => {
  it("targets -14 LUFS while respecting the true-peak ceiling", () => {
    expect(calculateLoudnessGainDb(-20, -8)).toBe(6);
    expect(calculateLoudnessGainDb(-20, -3)).toBe(2);
    expect(calculateLoudnessGainDb(-5, -0.2)).toBe(-9);
  });

  it("caps extreme adjustments", () => {
    expect(calculateLoudnessGainDb(-40, -30)).toBe(12);
    expect(calculateLoudnessGainDb(12, 12)).toBe(-24);
  });

  it("parses FFmpeg loudnorm JSON", () => {
    expect(
      parseLoudnormOutput(`noise before\n{
        "input_i" : "-19.40",
        "input_tp" : "-5.10",
        "input_lra" : "4.00"
      }\nnoise after`),
    ).toEqual({
      integratedLufs: -19.4,
      truePeakDb: -5.1,
      loudnessGainDb: 4.1,
    });
  });

  it("ignores silent or malformed measurements", () => {
    expect(parseLoudnormOutput('{ "input_i" : "-inf", "input_tp" : "-inf" }')).toBeNull();
    expect(parseLoudnormOutput("not json")).toBeNull();
  });
});
