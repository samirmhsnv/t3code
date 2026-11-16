import { createStore } from "zustand";
import type { ThreadPanelPresentation } from "../../rightPanelLayout";
import { resolveChatCanvasLayout, type ChatCanvasPreview } from "./chatCanvasLayout";
import { resolveThreadDetailsCardLayout } from "./threadDetailsCardLayout";

interface CanvasEdges {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ChatCanvasMeasurements {
  readonly width: number;
  readonly narrowestWidth?: number;
  readonly height: number;
  readonly padding: number;
  readonly maxChatWidth: number;
  readonly minChatWidth: number;
  readonly composerHeight: number;
  readonly timelineGutter: number;
  /** The docked details column beside the chat column, which the canvas gave its width to. */
  readonly detailsDockWidth?: number;
  /** The find bar's box in canvas coordinates while it is shown. */
  readonly findBar: CanvasEdges | null;
}

interface ChatCanvasStoreState {
  readonly measurements: ChatCanvasMeasurements;
  readonly setMeasurements: (next: ChatCanvasMeasurements) => void;
}

const INITIAL_MEASUREMENTS: ChatCanvasMeasurements = {
  width: 0,
  height: 0,
  padding: 48,
  maxChatWidth: 768,
  minChatWidth: 640,
  composerHeight: 0,
  timelineGutter: 0,
  findBar: null,
};

const sameEdges = (a: CanvasEdges | null, b: CanvasEdges | null) =>
  a === b ||
  (a !== null && b !== null && a.left === b.left && a.right === b.right && a.bottom === b.bottom);

const sameMeasurements = (a: ChatCanvasMeasurements, b: ChatCanvasMeasurements) =>
  a.width === b.width &&
  a.narrowestWidth === b.narrowestWidth &&
  a.height === b.height &&
  a.padding === b.padding &&
  a.maxChatWidth === b.maxChatWidth &&
  a.minChatWidth === b.minChatWidth &&
  a.composerHeight === b.composerHeight &&
  a.timelineGutter === b.timelineGutter &&
  a.detailsDockWidth === b.detailsDockWidth &&
  sameEdges(a.findBar, b.findBar);

/**
 * One store per chat view: the canvas measures into it, and the chat view's
 * header controls derive the details card presentation from the same inputs.
 */
export const createChatCanvasStore = () =>
  createStore<ChatCanvasStoreState>()((set) => ({
    measurements: INITIAL_MEASUREMENTS,
    setMeasurements: (next) =>
      set((state) => (sameMeasurements(state.measurements, next) ? state : { measurements: next })),
  }));

export type ChatCanvasStore = ReturnType<typeof createChatCanvasStore>;

export function resolveChatCanvasModel({
  measurements,
  preview,
}: {
  measurements: ChatCanvasMeasurements;
  preview: ChatCanvasPreview | null;
}) {
  const container = { width: measurements.width, height: measurements.height };
  const { findBar } = measurements;
  const detailsCardTopInset = findBar?.bottom ?? 0;
  const lane = { padding: measurements.padding, minChatWidth: measurements.minChatWidth };
  // The card docks in its own column, so it fits when the chat still fits beside it with the
  // column's width given back.
  const dockWidth = measurements.detailsDockWidth ?? 0;
  const detailsCardPlacement = resolveThreadDetailsCardLayout({
    container: { width: container.width + dockWidth, height: container.height },
    narrowestWidth: (measurements.narrowestWidth ?? measurements.width) + dockWidth,
    lane,
    frame: null,
  });
  const layout = resolveChatCanvasLayout({
    container,
    preview,
    padding: measurements.padding,
    maxChatWidth: measurements.maxChatWidth,
    minChatWidth: measurements.minChatWidth,
    composerHeight: measurements.composerHeight,
    findBar,
  });
  const detailsCardMode: ThreadPanelPresentation = detailsCardPlacement ? "inline" : "popover";
  return {
    container,
    lane,
    layout,
    detailsCardTopInset,
    detailsCardPlacement,
    detailsCardMode,
  };
}
