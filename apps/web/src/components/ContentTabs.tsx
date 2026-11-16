import { useAtomValue } from "@effect/atom-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { isElectron } from "../env";
import { useIssueList } from "../state/issues";
import { threadLinkedPullRequestKeysAtom } from "../state/pullRequests";
import { readPullRequestListPreferences } from "./pullRequest/pullRequestListPreferences";
import { useNavigateToMainApp } from "./sidebar/mainAppLocation";
import { StatusBar } from "./StatusBar";

type ContentTab = "chat" | "issues" | "pull-requests";

function activeContentTab(pathname: string): ContentTab {
  if (pathname === "/issues") return "issues";
  if (pathname === "/pull-requests") return "pull-requests";
  return "chat";
}

/** Chat, Issues and PRs, above whichever of those pages is open. */
export function ContentTabs({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const navigateToMainApp = useNavigateToMainApp();
  const pullRequestCount = useAtomValue(threadLinkedPullRequestKeysAtom).size;
  const issueCount = useIssueList().data?.issues.length ?? 0;
  const active = activeContentTab(pathname);

  return (
    // The page below sizes itself to the window; here it fills what the strip leaves.
    <div className="flex h-svh min-w-0 flex-1 flex-col md:h-dvh [&>[data-slot=sidebar-inset]]:h-auto [&>[data-slot=sidebar-inset]]:min-h-0 [&>[data-slot=sidebar-inset]]:flex-1">
      <nav
        aria-label="Content"
        className={cn(
          "flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-1 border-b border-border/60 bg-background pl-(--workspace-gutter-start) pr-(--workspace-gutter-end)",
          // A hidden sidebar leaves its reopen button floating over this strip's start.
          "group-data-[sidebar-state=collapsed]/sidebar-wrapper:pl-(--workspace-titlebar-content-left)",
          isElectron && "drag-region",
        )}
      >
        <ContentTabButton
          label="Chat"
          active={active === "chat"}
          onClick={() => void navigateToMainApp()}
        />
        <ContentTabButton
          label="Issues"
          count={issueCount}
          active={active === "issues"}
          onClick={() => void navigate({ to: "/issues" })}
        />
        <ContentTabButton
          label="PRs"
          count={pullRequestCount}
          active={active === "pull-requests"}
          onClick={() =>
            void navigate({ to: "/pull-requests", search: readPullRequestListPreferences() })
          }
        />
      </nav>
      {children}
      <StatusBar />
    </div>
  );
}

function ContentTabButton(props: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={props.active ? "page" : undefined}
      onClick={props.onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm outline-none [-webkit-app-region:no-drag] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        props.active
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {props.label}
      {props.count ? (
        <span className="text-xs tabular-nums text-muted-foreground">{props.count}</span>
      ) : null}
    </button>
  );
}
