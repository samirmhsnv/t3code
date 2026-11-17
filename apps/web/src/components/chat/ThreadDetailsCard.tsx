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
import { THREAD_DETAILS_CARD_GAP } from "./threadDetailsCardLayout";
import { observeResize } from "../../lib/observeResize";
import { requestWorkspaceFocus } from "../../lib/workspaceFocus";

export function ThreadDetailsCard({
  threadRef,
  anchor,
  handle,
  onContextMenu,
  children,
  extraCards,
}: {
  threadRef: ScopedThreadRef;
  anchor: RefObject<Element | null>;
  handle: ReturnType<typeof PopoverCreateHandle>;
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
  children: (density: "full" | "compact" | "essential") => ReactNode;
  /** Cards below the first, each shown while it renders a section. */
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
  const height = placement?.height ?? Math.max(0, (canvas?.container.height ?? 0) - 52);
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
  const [columnElement, setColumnElement] = useState<HTMLDivElement | null>(null);
  // Only the laid-out DOM knows the column's height, and the canvas keeps preview frames clear of it.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reports the card column's DOM height via ResizeObserver to the canvas
  useLayoutEffect(() => {
    const element = columnElement;
    if (!element || cardWidth === undefined || !measureDetailsCard) return;
    const measure = () => {
      if (element.offsetParent === null) return;
      measureDetailsCard({
        threadRef: { environmentId, threadId },
        width: cardWidth,
        fullContentHeight: element.offsetHeight,
      });
    };
    measure();
    return observeResize(element, measure);
  }, [columnElement, cardWidth, measureDetailsCard, environmentId, threadId]);
  const cardClassName = "dropdown-glass isolate contain-paint overflow-hidden rounded-2xl";
  // Cards keep their full height and the column scrolls as one; inline, the column runs to the
  // bottom and its last card takes the rest.
  const card = (
    <ScrollArea
      scrollFade
      className={cn(
        "min-h-0",
        mode === "popover" &&
          "max-h-[min(calc(100dvh-6.5rem),calc(var(--available-height,100dvh)-1rem))]",
      )}
      // Inline, the column fills its aside, which the window may stretch to its full height.
      style={placement ? { height: "100%" } : undefined}
    >
      <div
        ref={setColumnElement}
        className={cn(
          "flex flex-col gap-3",
          placement &&
            // The last card that shows takes the rest; a card shows while it holds a section.
            "min-h-full [&>[data-thread-details-card]:not(:has(~[data-thread-details-card]_section))]:grow",
        )}
        onContextMenu={onContextMenu}
      >
        <div className={cardClassName} data-thread-details-card>
          {children("full")}
        </div>
        {extraCards?.map((extra) =>
          extra ? (
            <div
              key={extra.key ?? undefined}
              className={cn(cardClassName, "[&:not(:has(section))]:hidden")}
              data-thread-details-card
            >
              {extra}
            </div>
          ) : null,
        )}
      </div>
    </ScrollArea>
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
            "absolute z-20 [-webkit-app-region:no-drag]",
            topInset > 0 && "transition-[top] duration-150 ease-out motion-reduce:transition-none",
          )}
          style={{
            right: placement.right,
            top: placement.y,
            width: placement.width,
            height,
          }}
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
        {mode === "popover" ? <div data-thread-details-panel="popover">{card}</div> : null}
      </PopoverPopup>
    </Popover>
  );
}
