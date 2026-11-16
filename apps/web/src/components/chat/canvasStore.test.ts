import { describe, expect, it } from "vite-plus/test";
import {
  createChatCanvasStore,
  resolveChatCanvasModel,
  type ChatCanvasMeasurements,
} from "./canvasStore";

const measurements = (width: number, height = 900): ChatCanvasMeasurements => ({
  width,
  height,
  padding: 48,
  maxChatWidth: 768,
  minChatWidth: 640,
  composerHeight: 180,
  timelineGutter: 0,
  findBar: null,
});

describe("chat canvas model", () => {
  it("docks the details card only where the chat still fits beside its column", () => {
    const resolve = (width: number, narrowestWidth = width, detailsDockWidth = 0) =>
      resolveChatCanvasModel({
        measurements: { ...measurements(width), narrowestWidth, detailsDockWidth },
        preview: null,
      }).detailsCardMode;
    expect(resolve(1400)).toBe("inline");
    expect(resolve(900)).toBe("popover");
    expect(resolve(1400, 900)).toBe("popover");
    // The open column took its width from the canvas, so the card stays docked.
    expect(resolve(900, 900, 280)).toBe("inline");
  });

  it("keeps state identity when a measurement repeats", () => {
    const store = createChatCanvasStore();
    store.getState().setMeasurements(measurements(1400));
    const before = store.getState();
    store.getState().setMeasurements(measurements(1400));
    expect(store.getState()).toBe(before);
    store.getState().setMeasurements({ ...measurements(1400), narrowestWidth: 900 });
    expect(store.getState().measurements.narrowestWidth).toBe(900);
    expect(store.getState()).not.toBe(before);
  });
});
