import { workspaceAreaProps } from "../../lib/workspaceFocus";
import {
  useLayoutEffect,
  useState,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "../../lib/utils";
import { Popover, PopoverPopup, PopoverCreateHandle } from "../ui/popover";
import { selectThreadPanelOpen, useRightPanelStore } from "../../rightPanelStore";
import { useChatCanvas } from "./ChatCanvasContext";
import {
  THREAD_DETAILS_CARD_GAP,
  resolveThreadDetailsCardDensity,
} from "./threadDetailsCardLayout";
import { observeResize } from "../../lib/observeResize";
import { requestWorkspaceFocus } from "../../lib/workspaceFocus";

export function ThreadDetailsCard({
  threadRef,
  anchor,
  handle,
  headerActions,
  contentKey,
  onContextMenu,
  children,
  extraCards,
}: {
  threadRef: ScopedThreadRef;
  anchor: RefObject<Element | null>;
  handle: ReturnType<typeof PopoverCreateHandle>;
  /** Controls atop the card. */
  headerActions?: ReactNode;
  /** Changes when the set of rendered items changes, so cached heights are measured again. */
  contentKey: string;
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
  children: (density: "full" | "compact" | "essential") => ReactNode;
  /** Cards below the first, each shown at full density while it renders a section. */
  extraCards?: ReadonlyArray<ReactElement | null>;
}) {
  const detailsArea = workspaceAreaProps("details", 3, "Thread details");
  const canvas = useChatCanvas();
  const preferredPlacement = canvas?.preferredDetailsCard ?? null;
  const placement = canvas?.detailsCardPlacement ?? null;
  const mode = placement ? "inline" : "popover";
  const topInset = canvas?.detailsCardTopInset ?? 0;
  const inlineOpen = useRightPanelStore((state) =>
    selectThreadPanelOpen(state.threadPanelVisibilityByThreadKey, threadRef, "inline"),
  );
  const popoverOpen = useRightPanelStore((state) =>
    selectThreadPanelOpen(state.threadPanelVisibilityByThreadKey, threadRef, "popover"),
  );
  const measurementKey = `${threadRef.environmentId}:${threadRef.threadId}:${mode}:${contentKey}`;
  const [measurements, setMeasurements] = useState({
    key: measurementKey,
    heights: { full: 0, compact: 0 },
  });
  const contentHeights =
    measurements.key === measurementKey ? measurements.heights : { full: 0, compact: 0 };
  const height = placement?.height ?? Math.max(0, (canvas?.container.height ?? 0) - 52);
  const density = resolveThreadDetailsCardDensity(height, contentHeights);
  const measureDetailsCard = canvas?.measureDetailsCard;
  const cardWidth = preferredPlacement?.width;
  const { environmentId, threadId } = threadRef;
  // The mode derives from canvas measurements, the preview frame and the
  // inline flag, which live in three stores, so no single write site sees the
  // card leave popover mode. A flag left set would reopen the popover unasked
  // when the card returns to popover mode.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- closes the popover flag in the right panel store when the derived mode turns inline
  useLayoutEffect(() => {
    if (mode === "inline" && popoverOpen)
      useRightPanelStore.getState().setThreadPanelOpen(threadRef, "popover", false);
  }, [mode, popoverOpen, threadRef]);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  // Re-measures when the density or measurement key changes, so each density's
  // height is measured once it renders.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- measures the card's DOM height via ResizeObserver to pick its density
  useLayoutEffect(() => {
    const element = contentElement;
    if (!element || density === "essential") return;
    // A hidden card (offsetParent null) has no height to report.
    const outerHeight = (content: HTMLElement | null) => {
      const frame = content?.closest<HTMLElement>("[data-thread-details-card]");
      if (!content || !frame || frame.offsetParent === null) return 0;
      return content.offsetHeight + frame.offsetHeight - frame.clientHeight;
    };
    const measure = () => {
      const next = outerHeight(element);
      // PR lists, servers and automations scroll as they grow. Counting them toward density
      // would hide the section controls when the user asks to see more.
      const lists = element.querySelectorAll<HTMLElement>(
        "[data-thread-details-pr-list], [data-thread-automations-panel], [data-thread-details-server-overflow]",
      );
      const fittingHeight =
        next - Array.from(lists).reduce((sum, list) => sum + list.offsetHeight, 0);
      setMeasurements((current) => {
        const heights = current.key === measurementKey ? current.heights : { full: 0, compact: 0 };
        return current.key === measurementKey && heights[density] === fittingHeight
          ? current
          : { key: measurementKey, heights: { ...heights, [density]: fittingHeight } };
      });
      // Only the laid-out DOM knows the full card height, and the canvas keeps preview
      // frames clear of it, so it is reported from this measure effect.
      if (density === "full" && cardWidth !== undefined) {
        measureDetailsCard?.({
          threadRef: { environmentId, threadId },
          width: cardWidth,
          fullContentHeight: next,
        });
      }
    };
    measure();
    return observeResize(element, measure);
  }, [
    contentElement,
    density,
    measurementKey,
    cardWidth,
    measureDetailsCard,
    environmentId,
    threadId,
  ]);
  const cardClassName =
    "dropdown-glass isolate contain-paint grid min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-2xl";
  const card = (
    <div
      className={cn(
        "flex flex-col gap-3",
        mode === "popover" &&
          "max-h-[min(calc(100dvh-6.5rem),calc(var(--available-height,100dvh)-1rem))]",
      )}
      style={placement ? { maxHeight: height } : undefined}
      onContextMenu={onContextMenu}
    >
      <div className={cardClassName} data-thread-details-card>
        <ScrollArea scrollFade className="min-h-0">
          <div ref={setContentElement}>
            {headerActions ? (
              <div className="flex items-center justify-end gap-1 px-2 pt-2">{headerActions}</div>
            ) : null}
            {children(density)}
          </div>
        </ScrollArea>
      </div>
      {density === "full"
        ? extraCards?.map((extra) =>
            extra ? (
              // Shrinks before the first card, so its scrolling lists give way to the controls.
              <div
                key={extra.key ?? undefined}
                className={cn(cardClassName, "shrink-[4] [&:not(:has(section))]:hidden")}
                data-thread-details-card
              >
                <ScrollArea scrollFade className="min-h-0">
                  {extra}
                </ScrollArea>
              </div>
            ) : null,
          )
        : null}
    </div>
  );
  return (
    <Popover
      handle={handle}
      open={mode === "popover" && popoverOpen}
      onOpenChange={(open, details) => {
        const target =
          details.reason === "focus-out"
            ? (details.event as FocusEvent).relatedTarget
            : details.reason === "outside-press"
              ? details.event.target
              : null;
        if (!open && target instanceof Element && target.closest("[data-thread-find-bar]")) {
          details.cancel();
          return;
        }
        useRightPanelStore.getState().setThreadPanelOpen(threadRef, "popover", open);
      }}
    >
      {placement && inlineOpen ? (
        <aside
          {...detailsArea}
          data-workspace-focus-key={`details:${threadRef.environmentId}:${threadRef.threadId}`}
          // Skip the return transition to avoid overlapping the rising preview.
          className={cn(
            "absolute z-20",
            topInset > 0 && "transition-[top] duration-150 ease-out motion-reduce:transition-none",
          )}
          style={{
            right: placement.right,
            top: placement.y,
            width: placement.width,
            maxHeight: height,
          }}
          data-density={density}
          data-thread-details-panel="inline"
        >
          {card}
        </aside>
      ) : null}
      {/* Rendered in both modes: base-ui keeps a popup that unmounts mid-open
          mounted, because its exit animation never finishes. Staying in the tree
          lets it close cleanly when the card switches inline. */}
      <PopoverPopup
        {...(mode === "popover" ? detailsArea : {})}
        role="dialog"
        data-workspace-focus-key={`details:${threadRef.environmentId}:${threadRef.threadId}`}
        initialFocus={() => {
          requestWorkspaceFocus({ area: "details" });
          return false;
        }}
        anchor={anchor}
        align="end"
        // Account for the find panel's 8px card padding.
        alignOffset={THREAD_DETAILS_CARD_GAP - 8}
        collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}
        side="bottom"
        sideOffset={topInset}
        variant="panel"
        padding="none"
      >
        {mode === "popover" ? (
          <div data-density={density} data-thread-details-panel="popover">
            {card}
          </div>
        ) : null}
      </PopoverPopup>
    </Popover>
  );
}
