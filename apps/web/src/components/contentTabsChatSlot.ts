import { createContext } from "react";

/** The active Chat tab's slot, where the open thread portals its breadcrumb. */
export const ContentTabsChatSlot = createContext<HTMLElement | null>(null);

/**
 * Lets the open thread host the tab strip in its own header, so an inline right panel can
 * take the window's full height instead of sitting under the strip.
 */
export const ContentTabsNavHost = createContext<((host: HTMLElement | null) => void) | null>(null);
