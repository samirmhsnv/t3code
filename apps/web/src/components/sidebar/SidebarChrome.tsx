import { SearchIcon, SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";
import { memo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { T3Wordmark } from "../T3Wordmark";
import {
  resolveEnvironmentIdentificationPillLabel,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { SidebarFooter, SidebarMenu, SidebarTrigger, useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning } from "./SidebarUpdatePill";
import { observeResize } from "~/lib/observeResize";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
  onSearch,
  actions,
}: {
  isElectron: boolean;
  onSearch: () => void;
  actions: ReactNode;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <div
      className={cn(
        "relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 pr-2",
        isElectron && "drag-region",
      )}
    >
      <div className="relative top-[calc(var(--workspace-controls-top)-env(safe-area-inset-top))] z-10 ml-[calc(var(--workspace-controls-left)+1px-env(safe-area-inset-left))] flex shrink-0 items-center md:hidden">
        <SidebarTrigger
          variant="ghost"
          className="relative top-auto translate-y-0"
          aria-label="Toggle main sidebar"
        />
      </div>
      <div className="relative z-10 flex h-8 min-w-0 flex-1 flex-wrap content-start items-center gap-x-2 overflow-hidden py-0.5">
        <div className="flex shrink-0 items-center gap-1">
          <SidebarBrand onBackdrop={false} />
          <SettingsButton />
        </div>
        {pillLabel ? (
          <div className="ml-1 flex h-7 items-center">
            <Badge data-environment-identification="pill" size="sm" variant="secondary">
              {pillLabel}
            </Badge>
          </div>
        ) : null}
      </div>
      <div className="relative z-10 flex shrink-0 items-center [-webkit-app-region:no-drag]">
        {actions}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="Search threads"
                onClick={onSearch}
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <SearchIcon className="size-4" />
          </TooltipTrigger>
          <TooltipPopup side="bottom">Search threads</TooltipPopup>
        </Tooltip>
        <SidebarTrigger
          variant="ghost"
          // Phones toggle the sheet from the leading trigger instead.
          className="relative top-auto translate-y-0 max-md:hidden"
          aria-label="Hide sidebar"
        />
      </div>
    </div>
  );
});

export function SidebarBrandWidthProbe({
  isElectron,
  onWidthChange,
}: {
  isElectron: boolean;
  onWidthChange: (width: number) => void;
}) {
  const observeWidth = (probe: HTMLDivElement) => {
    return observeResize(probe, ([entry]) => {
      if (entry) onWidthChange(entry.borderBoxSize[0]?.inlineSize ?? probe.offsetWidth);
    });
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible fixed top-0 left-0 flex w-max border-r border-transparent pr-3"
      ref={observeWidth}
    >
      <div className="ml-[var(--workspace-controls-left)] flex gap-1">
        <SidebarBrandMark onBackdrop={false} />
        {isElectron ? <div className="w-[calc(2*var(--workspace-titlebar-control-size))]" /> : null}
        {/* Search and hide-sidebar buttons. */}
        <div className="w-[calc(2*var(--workspace-titlebar-control-size))]" />
      </div>
    </div>
  );
}

function SettingsButton() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label="Settings"
            className="[-webkit-app-region:no-drag]"
            onClick={() => {
              if (isMobile) setOpenMobile(false);
              void navigate({ to: "/settings" });
            }}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <SettingsIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipPopup side="bottom">Settings</TooltipPopup>
    </Tooltip>
  );
}

function SidebarBrand({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <Link
      aria-label="T3 Code home"
      className={cn(
        "relative z-10 ml-[var(--workspace-controls-left)] hidden h-7 w-fit min-w-0 shrink-0 items-center overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset md:flex",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <SidebarBrandMark onBackdrop={onBackdrop} />
    </Link>
  );
}

function SidebarBrandMark({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1 text-sm font-medium tracking-tight">
      <T3Wordmark aria-label="T3" className="h-[1cap] w-auto shrink-0" />
      <span
        className={cn(
          "truncate [text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both_cap_alphabetic]:py-1",
          onBackdrop ? "text-white/70" : "text-muted-foreground",
        )}
      >
        Code
      </span>
    </span>
  );
}

// Settings lives in the top bar and PRs in the content tabs; the footer keeps only notices.
const SidebarUtilityMenu = memo(function SidebarUtilityMenu() {
  return (
    <SidebarMenu className="flex-row items-center empty:hidden">
      <SidebarThreadUndoNotice />
    </SidebarMenu>
  );
});

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter>
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      <SidebarUtilityMenu />
    </SidebarFooter>
  );
});
