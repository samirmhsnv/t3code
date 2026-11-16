import { formatProviderSkillDisplayName } from "@t3tools/shared/inlineSkills";
import type { ComposerPathSearchTarget } from "@t3tools/client-runtime/state/threads";
import {
  resolveProviderSkillSourceKind,
  type ProviderSkillSourceKind,
} from "@t3tools/client-runtime/providerSkills";
import {
  PROVIDER_DISPLAY_NAMES,
  type EnvironmentId,
  type EnvironmentMachineKind,
  type ProjectEntry,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type PullRequestContextMetadata,
  type ScopedThreadRef,
  type ServerProviderSkill,
  type ServerProviderSlashCommand,
} from "@t3tools/contracts";
import {
  BlocksIcon,
  FolderIcon,
  MessagesSquareIcon,
  PackageIcon,
  SettingsIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { memo, useLayoutEffect, useRef, useState } from "react";

import { type ComposerSlashCommand, type ComposerTriggerKind } from "../../composer-logic";
import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Command, CommandGroup, CommandGroupLabel, CommandItem, CommandList } from "../ui/command";
import { Kbd } from "../ui/kbd";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { PierreEntryIcon } from "./PierreEntryIcon";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { ComposerBanner } from "./ComposerBanner";
import { resolvePullRequestState } from "../pullRequest/pullRequestPresentation";

export type ComposerCommandItem =
  | {
      id: string;
      type: "path";
      path: string;
      pathKind: ProjectEntry["kind"];
      searchTarget: ComposerPathSearchTarget;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "slash-command";
      command: ComposerSlashCommand;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "provider-slash-command";
      provider: ProviderDriverKind;
      command: ServerProviderSlashCommand;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "skill";
      provider: ProviderDriverKind;
      skill: ServerProviderSkill;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "pull-request";
      pullRequest: PullRequestContextMetadata;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "thread";
      thread: ScopedThreadRef;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "environment";
      environmentId: EnvironmentId;
      machine: EnvironmentMachineKind;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "model";
      instanceId: ProviderInstanceId;
      model: string;
      driverKind: ProviderDriverKind;
      providerDisplayName: string;
      acpRegistryAgentId: string | undefined;
      acpRegistryIconUrl: string | undefined;
      label: string;
      description: string;
    };

export const ComposerCommandMenu = memo(function ComposerCommandMenu(props: {
  listId: string;
  items: ComposerCommandItem[];
  resolvedTheme: "light" | "dark";
  isLoading: boolean;
  triggerKind: ComposerTriggerKind | null;
  emptyStateText?: string;
  activeItemId: string | null;
  onHighlightedItemChange: (itemId: string | null) => void;
  onSelect: (item: ComposerCommandItem) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- scrolls the highlighted menu item's DOM node into view
  useLayoutEffect(() => {
    if (!props.activeItemId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-composer-item-id="${CSS.escape(props.activeItemId)}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [props.activeItemId]);

  return (
    <Command
      autoHighlight={false}
      mode="none"
      onItemHighlighted={(highlightedValue) => {
        props.onHighlightedItemChange(
          typeof highlightedValue === "string" ? highlightedValue : null,
        );
      }}
    >
      <ComposerBanner.Surface
        ref={listRef}
        className="flex min-h-0 w-full flex-col overflow-hidden pb-(--chat-composer-attachment-overlap) **:data-[slot=command-item]:rounded-lg **:data-[slot=scroll-area-scrollbar]:data-[orientation=vertical]:my-4"
        data-composer-command-drawer="true"
      >
        {props.items.length > 0 ? (
          <CommandList
            id={props.listId}
            aria-label={props.triggerKind ? LISTBOX_LABEL_BY_TRIGGER[props.triggerKind] : undefined}
            className="max-h-72 min-h-0 scroll-pb-6"
          >
            {groupComposerMenuItems(props.items, props.triggerKind).map((group) => (
              <CommandGroup key={group.key}>
                <CommandGroupLabel>
                  <span className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-muted-foreground text-xs">
                    {group.provider ? (
                      <ProviderInstanceIcon
                        driverKind={group.provider}
                        displayName={group.label}
                        className="size-3.5 shrink-0"
                        iconClassName="size-3.5"
                      />
                    ) : null}
                    {group.label}
                  </span>
                </CommandGroupLabel>
                {group.items.map((item) => (
                  <ComposerCommandMenuItem
                    key={item.id}
                    optionId={composerSuggestionOptionId(props.listId, item.id)}
                    item={item}
                    triggerKind={props.triggerKind}
                    resolvedTheme={props.resolvedTheme}
                    isActive={props.activeItemId === item.id}
                    onHighlight={props.onHighlightedItemChange}
                    onSelect={props.onSelect}
                  />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        ) : null}
        {props.items.length > 0 ? (
          <div
            aria-hidden="true"
            className="flex shrink-0 items-center gap-3 border-t border-border/70 px-3 py-1.5 text-muted-foreground text-xs"
          >
            <ComposerMenuKeyHint keys="↑↓" label="navigate" />
            <ComposerMenuKeyHint
              keys="↩"
              label={props.triggerKind === "slash-command" ? "run" : "insert"}
            />
            <ComposerMenuKeyHint keys="esc" label="close" />
            <span className="ms-auto tabular-nums">
              {props.items.length} {props.items.length === 1 ? "result" : "results"}
            </span>
          </div>
        ) : (
          <div className="px-5 pt-3.5 pb-7">
            <p className="text-secondary-label text-xs">
              {props.isLoading
                ? props.triggerKind === "skill" || props.triggerKind === "slash-command"
                  ? "Searching workspace skills..."
                  : props.triggerKind === "pull-request"
                    ? "Finding pull request..."
                    : "Searching workspace files..."
                : (props.emptyStateText ??
                  (props.triggerKind === "skill"
                    ? "No skills found. Try / to browse provider commands."
                    : props.triggerKind === "path"
                      ? "No matching files or folders."
                      : "No matching command."))}
            </p>
          </div>
        )}
      </ComposerBanner.Surface>
    </Command>
  );
});

const ComposerCommandMenuItem = memo(function ComposerCommandMenuItem(props: {
  optionId: string;
  item: ComposerCommandItem;
  triggerKind: ComposerTriggerKind | null;
  resolvedTheme: "light" | "dark";
  isActive: boolean;
  onHighlight: (itemId: string | null) => void;
  onSelect: (item: ComposerCommandItem) => void;
}) {
  const skillSourceKind =
    props.item.type === "skill" ? resolveProviderSkillSourceKind(props.item.skill) : null;
  const isSlashSkill =
    props.triggerKind === "slash-command" && props.item.type === "skill" ? props.item.skill : null;
  const pullRequestPresentation =
    props.item.type === "pull-request" ? resolvePullRequestState(props.item.pullRequest) : null;
  const descriptionRef = useRef<HTMLSpanElement>(null);
  const [descriptionTruncated, setDescriptionTruncated] = useState(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- measures the rendered description so only cut-off text gets a tooltip
  useLayoutEffect(() => {
    const description = descriptionRef.current;
    setDescriptionTruncated(
      props.isActive && !!description && description.scrollWidth > description.clientWidth,
    );
  }, [props.isActive]);

  return (
    <CommandItem
      render={<div id={props.optionId} />}
      aria-selected={props.isActive}
      value={props.item.id}
      data-composer-item-id={props.item.id}
      active={props.isActive}
      onMouseMove={() => {
        if (!props.isActive) props.onHighlight(props.item.id);
      }}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={() => {
        props.onSelect(props.item);
      }}
    >
      {props.item.type === "path" ? (
        <PierreEntryIcon
          pathValue={props.item.path}
          kind={props.item.pathKind}
          theme={props.resolvedTheme}
        />
      ) : null}
      {props.item.type === "thread" ? (
        <MessagesSquareIcon aria-hidden="true" className="size-4 shrink-0 text-secondary-label" />
      ) : null}
      {props.item.type === "environment" ? (
        <EnvironmentMachineIcon
          kind={props.item.machine}
          aria-hidden="true"
          className="size-4 shrink-0 text-secondary-label"
        />
      ) : null}
      {props.item.type === "model" ? (
        <ProviderInstanceIcon
          driverKind={props.item.driverKind}
          displayName={props.item.providerDisplayName}
          acpRegistryAgentId={props.item.acpRegistryAgentId}
          acpRegistryIconUrl={props.item.acpRegistryIconUrl}
          className="size-4 shrink-0"
          iconClassName="size-4"
        />
      ) : null}
      {pullRequestPresentation ? (
        <pullRequestPresentation.Icon
          role="img"
          aria-label={pullRequestPresentation.label}
          className={cn("size-4 shrink-0", pullRequestPresentation.toneClassName)}
        />
      ) : null}
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={cn(
            "min-w-0 max-w-[45%] shrink-0 truncate text-xs font-medium",
            MONO_ITEM_TYPES.has(props.item.type) ? "font-mono" : "font-sans",
          )}
        >
          {isSlashSkill ? (
            <>
              <span className="text-secondary-label">/skill:</span>
              {formatProviderSkillDisplayName(isSlashSkill)}
            </>
          ) : (
            props.item.label
          )}
        </span>
        <Tooltip open={descriptionTruncated}>
          <TooltipTrigger
            tabIndex={-1}
            render={
              <span
                ref={descriptionRef}
                className="min-w-0 flex-1 truncate text-left text-secondary-label text-xs"
              />
            }
          >
            {props.item.description}
          </TooltipTrigger>
          <TooltipPopup>{props.item.description}</TooltipPopup>
        </Tooltip>
        {skillSourceKind ? (
          <SkillSourceBadge
            kind={skillSourceKind}
            showSkillSuffix={props.triggerKind === "skill"}
          />
        ) : null}
        {props.isActive ? (
          <Kbd className={cn("shrink-0", !skillSourceKind && "ms-auto")}>↩</Kbd>
        ) : null}
      </span>
    </CommandItem>
  );
});

const MONO_ITEM_TYPES = new Set<ComposerCommandItem["type"]>([
  "slash-command",
  "provider-slash-command",
  "skill",
]);

type ComposerMenuGroup = {
  key: string;
  label: string;
  provider: ProviderDriverKind | null;
  items: ComposerCommandItem[];
};

function providerName(provider: ProviderDriverKind): string {
  return PROVIDER_DISPLAY_NAMES[provider] ?? provider;
}

function composerMenuSection(
  item: ComposerCommandItem,
  triggerKind: ComposerTriggerKind | null,
): Omit<ComposerMenuGroup, "items"> {
  switch (item.type) {
    case "path":
      return { key: "path", label: "Files", provider: null };
    case "thread":
      return { key: "thread", label: "Threads", provider: null };
    case "pull-request":
      return { key: "pull-request", label: "Pull requests", provider: null };
    case "environment":
      return { key: "environment", label: "Environments", provider: null };
    case "model":
      return { key: "model", label: "Models", provider: null };
    case "slash-command":
      return { key: "slash-command", label: "T3 Code", provider: null };
    case "provider-slash-command":
      return {
        key: `provider-command:${item.provider}`,
        label: providerName(item.provider),
        provider: item.provider,
      };
    case "skill":
      return triggerKind === "skill"
        ? {
            key: `skill:${item.provider}`,
            label: `${providerName(item.provider)} skills`,
            provider: item.provider,
          }
        : { key: "skill", label: "Skills", provider: null };
  }
}

/** Runs of same-kind items under one label; the items keep their ranked order. */
function groupComposerMenuItems(
  items: ReadonlyArray<ComposerCommandItem>,
  triggerKind: ComposerTriggerKind | null,
): ComposerMenuGroup[] {
  const groups: ComposerMenuGroup[] = [];
  for (const item of items) {
    const section = composerMenuSection(item, triggerKind);
    const last = groups.at(-1);
    if (last && last.key.startsWith(`${section.key}#`)) {
      last.items.push(item);
    } else {
      groups.push({ ...section, key: `${section.key}#${groups.length}`, items: [item] });
    }
  }
  return groups;
}

function ComposerMenuKeyHint(props: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <Kbd variant="outline">{props.keys}</Kbd>
      {props.label}
    </span>
  );
}

export function composerSuggestionOptionId(listId: string, itemId: string): string {
  // JSON escapes lone UTF-16 surrogates before URI encoding without losing identity.
  return `${listId}-${encodeURIComponent(JSON.stringify(itemId))}`;
}

const LISTBOX_LABEL_BY_TRIGGER: Record<ComposerTriggerKind, string> = {
  path: "Files and folders",
  "pull-request": "Pull requests",
  "slash-command": "Commands",
  skill: "Skills",
};

const SKILL_SOURCE_ICON_BY_KIND: Record<ProviderSkillSourceKind, LucideIcon> = {
  app: BlocksIcon,
  repo: FolderIcon,
  project: FolderIcon,
  personal: UserRoundIcon,
  system: SettingsIcon,
  other: PackageIcon,
};

const SKILL_SOURCE_LABEL_BY_KIND: Record<ProviderSkillSourceKind, string> = {
  app: "App",
  repo: "Repo",
  project: "Project",
  personal: "Personal",
  system: "System",
  other: "Provider",
};

function SkillSourceBadge(props: { kind: ProviderSkillSourceKind; showSkillSuffix: boolean }) {
  const Icon = SKILL_SOURCE_ICON_BY_KIND[props.kind];
  return (
    <Badge className="ms-auto" variant="secondary">
      <Icon aria-hidden="true" className="text-current" />
      {SKILL_SOURCE_LABEL_BY_KIND[props.kind]}
      {props.showSkillSuffix ? " Skill" : null}
    </Badge>
  );
}
