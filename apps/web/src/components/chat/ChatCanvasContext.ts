import { createContext, useContext } from "react";
import type { resolveChatCanvasLayout } from "./chatCanvasLayout";
import type { resolveThreadDetailsCardLayout } from "./threadDetailsCardLayout";

export const ChatCanvasContext = createContext<{
  container: { width: number; height: number };
  lane: { padding: number; minChatWidth: number };
  layout: ReturnType<typeof resolveChatCanvasLayout>;
  previewKey: string | null;
  registerTimeline: (element: HTMLElement | null) => void;
  detailsCardTopInset: number;
  /** Where the docked card sits now; null when it shows as a popover. */
  detailsCardPlacement: ReturnType<typeof resolveThreadDetailsCardLayout>;
} | null>(null);

export const useChatCanvas = () => useContext(ChatCanvasContext);
