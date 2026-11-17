import { createContext } from "react";

/** The active Chat tab's slot, where the open thread portals its breadcrumb. */
export const ContentTabsChatSlot = createContext<HTMLElement | null>(null);
