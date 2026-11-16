import {
  ISSUE_SOURCE_LABELS,
  type IssueDetail,
  type IssueLabel,
  type IssueOptions,
  type IssueReference,
  type IssueUpdatePatch,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import {
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";

import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { issueEnvironment, useIssueDetail, useIssueOptions } from "../../state/issues";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import ChatMarkdown from "../ChatMarkdown";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { Kbd } from "../ui/kbd";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSearchInput,
  MenuTrigger,
} from "../ui/menu";
import { Separator } from "../ui/separator";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  IssueAvatar,
  IssuePriorityIcon,
  IssueSourceIcon,
  IssueStatusIcon,
  PRIORITY_LABELS,
} from "./IssueIcons";
import { filterByName, sameIds, withCurrent } from "./issueDetail.logic";
import { PRIORITY_ORDER } from "./issueList.logic";

const UNASSIGNED = "__unassigned__";
const NO_OPTIONS: IssueOptions = { containers: [], statuses: [], members: [], labels: [] };

const labelStyle = (label: IssueLabel) =>
  label.color ? { style: { "--label": label.color } as CSSProperties } : {};

const fullTime = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
};

function RelativeTime({ iso }: { readonly iso: string }) {
  const full = fullTime(iso);
  const label = formatRelativeTimeLabel(iso);
  if (full === undefined) return <time dateTime={iso}>{label}</time>;
  return (
    <Tooltip>
      <TooltipTrigger render={<time dateTime={iso} />}>{label}</TooltipTrigger>
      <TooltipPopup side="top">{full}</TooltipPopup>
    </Tooltip>
  );
}

function PropertyRow({
  label,
  align = "center",
  children,
}: {
  readonly label: string;
  readonly align?: "center" | "start";
  readonly children: ReactNode;
}) {
  return (
    <div className={align === "start" ? "flex items-start gap-2" : "flex items-center gap-2"}>
      <dt className="flex h-6 w-20 shrink-0 items-center text-xs text-muted-foreground">{label}</dt>
      <dd className="flex min-h-6 min-w-0 flex-1 flex-wrap items-center gap-1">{children}</dd>
    </div>
  );
}

/** A property shown without a picker; padded to line up with the picker buttons. */
function StaticValue({ children }: { readonly children: ReactNode }) {
  return (
    <span className="flex h-6 min-w-0 items-center gap-1.5 px-2 text-xs text-foreground">
      {children}
    </span>
  );
}

function PickerTrigger({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <MenuTrigger
      render={<Button size="xs" variant="ghost" className="min-w-0 max-w-full justify-start" />}
      aria-label={label}
    >
      {children}
    </MenuTrigger>
  );
}

function Muted({ children }: { readonly children: ReactNode }) {
  return <span className="truncate text-muted-foreground">{children}</span>;
}

function StatusPicker({
  issue,
  options,
  canWrite,
  onUpdate,
}: {
  readonly issue: IssueDetail;
  readonly options: IssueOptions;
  readonly canWrite: boolean;
  readonly onUpdate: (patch: IssueUpdatePatch) => void;
}) {
  const value = (
    <>
      <IssueStatusIcon status={issue.status} />
      <span className="truncate">{issue.status.name}</span>
    </>
  );
  if (!canWrite || options.statuses.length === 0) return <StaticValue>{value}</StaticValue>;
  const statuses = withCurrent(options.statuses, [issue.status]);
  return (
    <Menu>
      <PickerTrigger label={`Status: ${issue.status.name}`}>{value}</PickerTrigger>
      <MenuPopup align="start">
        <MenuRadioGroup
          value={issue.status.id ?? issue.status.name}
          onValueChange={(next) => {
            const status = statuses.find((candidate) => candidate.id === next);
            if (status?.id !== undefined && status.id !== issue.status.id)
              onUpdate({ statusId: status.id });
          }}
        >
          {statuses.map((status) => (
            <MenuRadioItem key={status.id ?? status.name} value={status.id ?? status.name}>
              <span className="flex min-w-0 items-center gap-2">
                <IssueStatusIcon status={status} />
                <span className="min-w-0 flex-1 truncate">{status.name}</span>
                <MenuRadioItemIndicator />
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

function PriorityPicker({
  issue,
  canWrite,
  onUpdate,
}: {
  readonly issue: IssueDetail;
  readonly canWrite: boolean;
  readonly onUpdate: (patch: IssueUpdatePatch) => void;
}) {
  const value = (
    <>
      <IssuePriorityIcon priority={issue.priority} />
      {issue.priority === "none" ? (
        <Muted>{PRIORITY_LABELS.none}</Muted>
      ) : (
        <span className="truncate">{PRIORITY_LABELS[issue.priority]}</span>
      )}
    </>
  );
  if (!canWrite) return <StaticValue>{value}</StaticValue>;
  return (
    <Menu>
      <PickerTrigger label={`Priority: ${PRIORITY_LABELS[issue.priority]}`}>{value}</PickerTrigger>
      <MenuPopup align="start">
        <MenuRadioGroup
          value={issue.priority}
          onValueChange={(next) => {
            const priority = PRIORITY_ORDER.find((candidate) => candidate === next);
            if (priority && priority !== issue.priority) onUpdate({ priority });
          }}
        >
          {PRIORITY_ORDER.map((priority) => (
            <MenuRadioItem key={priority} value={priority}>
              <span className="flex min-w-0 items-center gap-2">
                <IssuePriorityIcon priority={priority} />
                <span className="min-w-0 flex-1 truncate">{PRIORITY_LABELS[priority]}</span>
                <MenuRadioItemIndicator />
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

function AssigneePicker({
  issue,
  options,
  canWrite,
  onUpdate,
}: {
  readonly issue: IssueDetail;
  readonly options: IssueOptions;
  readonly canWrite: boolean;
  readonly onUpdate: (patch: IssueUpdatePatch) => void;
}) {
  const [query, setQuery] = useState("");
  const value = (
    <>
      <IssueAvatar person={issue.assignee} />
      {issue.assignee ? (
        <span className="truncate">{issue.assignee.name}</span>
      ) : (
        <Muted>No assignee</Muted>
      )}
    </>
  );
  if (!canWrite) return <StaticValue>{value}</StaticValue>;
  const members = filterByName(
    withCurrent(options.members, issue.assignee ? [issue.assignee] : []),
    query,
  );
  return (
    <Menu
      onOpenChange={(open) => {
        if (!open) setQuery("");
      }}
    >
      <PickerTrigger label={`Assignee: ${issue.assignee?.name ?? "No assignee"}`}>
        {value}
      </PickerTrigger>
      <MenuPopup align="start">
        <div className="w-60 max-w-full">
          <MenuSearchInput
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Assign to…"
            aria-label="Search people"
          />
          <MenuRadioGroup
            value={issue.assignee?.id ?? UNASSIGNED}
            onValueChange={(next) => {
              if (next === (issue.assignee?.id ?? UNASSIGNED)) return;
              onUpdate({ assigneeId: next === UNASSIGNED ? null : String(next) });
            }}
          >
            {query.trim() === "" ? (
              <MenuRadioItem value={UNASSIGNED}>
                <span className="flex min-w-0 items-center gap-2">
                  <IssueAvatar person={undefined} />
                  <span className="min-w-0 flex-1 truncate">No assignee</span>
                  <MenuRadioItemIndicator />
                </span>
              </MenuRadioItem>
            ) : null}
            {members.map((member) => (
              <MenuRadioItem key={member.id} value={member.id}>
                <span className="flex min-w-0 items-center gap-2">
                  <IssueAvatar person={member} />
                  <span className="min-w-0 flex-1 truncate">{member.name}</span>
                  <MenuRadioItemIndicator />
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          {members.length === 0 && query.trim() !== "" ? (
            <MenuItem disabled>No one matches</MenuItem>
          ) : null}
        </div>
      </MenuPopup>
    </Menu>
  );
}

/** Toggles collect while the popup is open and save as one write when it closes. */
function LabelsPicker({
  issue,
  options,
  canWrite,
  onUpdate,
}: {
  readonly issue: IssueDetail;
  readonly options: IssueOptions;
  readonly canWrite: boolean;
  readonly onUpdate: (patch: IssueUpdatePatch) => void;
}) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<ReadonlySet<string> | null>(null);
  const current = new Set(issue.labels.map((label) => label.id));
  const chips = issue.labels.map((label) => (
    <Badge
      key={label.id}
      size="sm"
      variant={label.color ? "label" : "secondary"}
      className="max-w-full min-w-0"
      {...labelStyle(label)}
    >
      <span className="truncate">{label.name}</span>
    </Badge>
  ));
  const all = withCurrent(options.labels, issue.labels);
  if (!canWrite || all.length === 0)
    return chips.length > 0 ? (
      chips
    ) : (
      <StaticValue>
        <Muted>No labels</Muted>
      </StaticValue>
    );
  const selected = draft ?? current;
  const labels = filterByName(all, query);
  return (
    <>
      {chips}
      <Menu
        onOpenChange={(open) => {
          if (open) return setDraft(current);
          setQuery("");
          if (draft !== null && !sameIds(draft, current)) onUpdate({ labelIds: [...draft] });
          setDraft(null);
        }}
      >
        {chips.length > 0 ? (
          <MenuTrigger
            render={<Button size="icon-xs" variant="ghost-muted" aria-label="Edit labels" />}
          >
            <PlusIcon />
          </MenuTrigger>
        ) : (
          <PickerTrigger label="Add labels">
            <Muted>No labels</Muted>
          </PickerTrigger>
        )}
        <MenuPopup align="start">
          <div className="w-60 max-w-full">
            <MenuSearchInput
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Add labels…"
              aria-label="Search labels"
            />
            {labels.map((label) => (
              <MenuCheckboxItem
                key={label.id}
                checked={selected.has(label.id)}
                onCheckedChange={(checked) => {
                  const next = new Set(selected);
                  if (checked) next.add(label.id);
                  else next.delete(label.id);
                  setDraft(next);
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Badge
                    size="sm"
                    variant={label.color ? "label" : "secondary"}
                    className="max-w-full min-w-0"
                    {...labelStyle(label)}
                  >
                    <span className="truncate">{label.name}</span>
                  </Badge>
                </span>
              </MenuCheckboxItem>
            ))}
            {labels.length === 0 ? <MenuItem disabled>No labels match</MenuItem> : null}
          </div>
        </MenuPopup>
      </Menu>
    </>
  );
}

function IssueProperties({
  issue,
  options,
  canWrite,
  onUpdate,
}: {
  readonly issue: IssueDetail;
  readonly options: IssueOptions;
  readonly canWrite: boolean;
  readonly onUpdate: (patch: IssueUpdatePatch) => void;
}) {
  const label = ISSUE_SOURCE_LABELS[issue.source];
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <dl className="flex flex-col gap-1">
        <PropertyRow label="Status">
          <StatusPicker issue={issue} options={options} canWrite={canWrite} onUpdate={onUpdate} />
        </PropertyRow>
        <PropertyRow label="Priority">
          <PriorityPicker issue={issue} canWrite={canWrite} onUpdate={onUpdate} />
        </PropertyRow>
        <PropertyRow label="Assignee">
          <AssigneePicker issue={issue} options={options} canWrite={canWrite} onUpdate={onUpdate} />
        </PropertyRow>
        <PropertyRow label="Labels" align="start">
          <LabelsPicker issue={issue} options={options} canWrite={canWrite} onUpdate={onUpdate} />
        </PropertyRow>
        <PropertyRow label={issue.source === "linear" ? "Team" : "Project"}>
          <StaticValue>
            {issue.container ? (
              <span className="truncate">{issue.container.name}</span>
            ) : (
              <Muted>None</Muted>
            )}
          </StaticValue>
        </PropertyRow>
        {issue.project ? (
          <PropertyRow label="Project">
            <StaticValue>
              <span className="truncate">{issue.project}</span>
            </StaticValue>
          </PropertyRow>
        ) : null}
      </dl>
      <Separator />
      <dl className="flex flex-col gap-1">
        <PropertyRow label="Created">
          <StaticValue>
            {issue.creator ? <IssueAvatar person={issue.creator} /> : null}
            <span className="truncate">
              <RelativeTime iso={issue.createdAt} />
            </span>
          </StaticValue>
        </PropertyRow>
        <PropertyRow label="Updated">
          <StaticValue>
            <RelativeTime iso={issue.updatedAt} />
          </StaticValue>
        </PropertyRow>
        <PropertyRow label="Tracker">
          <Button
            size="xs"
            variant="ghost"
            className="min-w-0 max-w-full justify-start"
            render={<a href={issue.url} target="_blank" rel="noreferrer noopener" />}
          >
            <IssueSourceIcon source={issue.source} />
            <span className="truncate">{label}</span>
            <ExternalLinkIcon />
          </Button>
        </PropertyRow>
      </dl>
    </div>
  );
}

/** Click to edit in place: Enter or leaving the field saves, Escape cancels. */
function IssueTitle({
  title,
  canWrite,
  onSave,
}: {
  readonly title: string;
  readonly canWrite: boolean;
  readonly onSave: (title: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const classes = "-mx-1 w-full rounded-md px-1 text-xl font-semibold leading-snug text-foreground";
  if (!canWrite) return <h1 className={classes}>{title}</h1>;
  if (draft === null)
    return (
      <h1>
        <button
          type="button"
          className={`${classes} cursor-text text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset`}
          onClick={() => setDraft(title)}
        >
          {title}
        </button>
      </h1>
    );
  return (
    <textarea
      aria-label="Title"
      value={draft}
      rows={1}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      className={`${classes} field-sizing-content resize-none bg-transparent outline-none ring-1 ring-ring/40 focus-visible:ring-ring`}
      onChange={(event) => setDraft(event.target.value.replace(/\n/g, " "))}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      onBlur={async () => {
        const next = draft.trim();
        if (cancelled.current || next === "" || next === title) {
          cancelled.current = false;
          return setDraft(null);
        }
        if (await onSave(next)) setDraft(null);
      }}
    />
  );
}

function IssueDescription({
  description,
  canWrite,
  onSave,
}: {
  readonly description: string;
  readonly canWrite: boolean;
  readonly onSave: (description: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async (next: string) => {
    if (saving) return;
    if (next === description) return setDraft(null);
    setSaving(true);
    const saved = await onSave(next);
    setSaving(false);
    if (saved) setDraft(null);
  };
  if (draft !== null)
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save(draft);
        }}
      >
        <Textarea
          aria-label="Description"
          value={draft}
          rows={8}
          autoFocus
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void save(draft);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setDraft(null);
            }
          }}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" size="xs" variant="ghost" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button type="submit" size="xs" disabled={saving}>
            Save
          </Button>
        </div>
      </form>
    );
  if (description.trim() === "")
    return canWrite ? (
      <div>
        <Button size="xs" variant="ghost-muted" onClick={() => setDraft("")}>
          Add a description…
        </Button>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">No description</p>
    );
  return (
    <div className="group flex flex-col gap-1">
      <ChatMarkdown text={description} cwd={undefined} lineBreaks />
      {canWrite ? (
        <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
          <Button size="xs" variant="ghost-muted" onClick={() => setDraft(description)}>
            <PencilIcon />
            Edit
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CommentComposer({
  onComment,
}: {
  readonly onComment: (body: string) => Promise<boolean>;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (body.trim() === "" || sending) return;
    setSending(true);
    const sent = await onComment(body);
    setSending(false);
    if (sent) setBody("");
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <Textarea
        aria-label="Leave a comment"
        placeholder="Leave a comment…"
        value={body}
        disabled={sending}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void send();
          }
        }}
      />
      <div className="flex items-center justify-end gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground max-sm:hidden">
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd>
        </span>
        <Button type="submit" size="xs" disabled={sending || body.trim() === ""}>
          Comment
        </Button>
      </div>
    </form>
  );
}

function IssueActivity({
  issue,
  canComment,
  onComment,
}: {
  readonly issue: IssueDetail;
  readonly canComment: boolean;
  readonly onComment: (body: string) => Promise<boolean>;
}) {
  const count = issue.comments.length;
  return (
    <section aria-labelledby="issue-activity" className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <h2 id="issue-activity" className="text-sm font-medium text-foreground">
          Activity
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count} {count === 1 ? "comment" : "comments"}
        </span>
      </div>
      <ol className="relative flex flex-col gap-5 before:absolute before:inset-y-2.5 before:left-2.5 before:w-px before:bg-border">
        <li className="relative flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-background">
            <IssueAvatar person={issue.creator} />
          </span>
          <span className="min-w-0 truncate">
            <span className="font-medium text-foreground">{issue.creator?.name ?? "Someone"}</span>{" "}
            created the issue · <RelativeTime iso={issue.createdAt} />
          </span>
        </li>
        {issue.comments.map((comment) => (
          <li key={comment.id} className="relative flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-background">
                <IssueAvatar person={comment.author} className="size-5" />
              </span>
              <span className="truncate font-medium text-foreground">
                {comment.author?.name ?? "Unknown"}
              </span>
              <span className="shrink-0 text-muted-foreground">
                <RelativeTime iso={comment.createdAt} />
              </span>
            </div>
            <div className="ps-7">
              <ChatMarkdown text={comment.body} cwd={undefined} lineBreaks />
            </div>
          </li>
        ))}
      </ol>
      {canComment ? <CommentComposer onComment={onComment} /> : null}
    </section>
  );
}

function IssueBreadcrumb({
  issue,
  reference,
}: {
  readonly issue: IssueDetail | null;
  readonly reference: IssueReference;
}) {
  const parents = [issue?.container?.name, issue?.project].filter(
    (part): part is string => part !== undefined && part !== "",
  );
  return (
    <nav aria-label="Issue breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
      <IssueSourceIcon source={reference.source} />
      {parents.map((part) => (
        <span key={part} className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <span className="truncate">{part}</span>
          <ChevronRightIcon aria-hidden className="size-3 shrink-0" />
        </span>
      ))}
      <span className="shrink-0 font-medium text-foreground">{issue?.identifier ?? "…"}</span>
    </nav>
  );
}

function CopyLinkButton({ url }: { readonly url: string }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Copy link"
            onClick={() => copyToClipboard(url)}
          />
        }
      >
        {isCopied ? <CheckIcon /> : <LinkIcon />}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{isCopied ? "Copied" : "Copy link"}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * One issue read and edited in place: the document on the left, its properties on the right.
 * Every write re-reads it and the list.
 */
export function IssueDetailPanel({
  reference,
  onClose,
}: {
  readonly reference: IssueReference;
  readonly onClose: () => void;
}) {
  const environmentId = usePrimaryEnvironmentId();
  const query = useIssueDetail(reference);
  const issue = query.data;
  const options = useIssueOptions(
    issue === null ? null : reference.source,
    issue?.container?.id,
  ).data;
  const canWrite = useAtomValue(issueEnvironment.update.permissionAtom(environmentId));
  const canComment = useAtomValue(issueEnvironment.addComment.permissionAtom(environmentId));
  const update = useAtomCommand(issueEnvironment.update, { label: "update issue" });
  const addComment = useAtomCommand(issueEnvironment.addComment, { label: "comment on issue" });
  const label = ISSUE_SOURCE_LABELS[reference.source];

  const patch = async (next: IssueUpdatePatch) => {
    if (environmentId === null) return false;
    const result = await update({ environmentId, input: { ...reference, patch: next } });
    return result._tag === "Success";
  };
  const comment = async (body: string) => {
    if (environmentId === null) return false;
    const result = await addComment({ environmentId, input: { ...reference, body } });
    return result._tag === "Success";
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-4">
        <IssueBreadcrumb issue={issue} reference={reference} />
        {issue ? (
          <>
            <CopyLinkButton url={issue.url} />
            <Button
              size="xs"
              variant="ghost"
              render={<a href={issue.url} target="_blank" rel="noreferrer noopener" />}
            >
              <ExternalLinkIcon />
              <span className="max-sm:sr-only">Open in {label}</span>
            </Button>
          </>
        ) : null}
        <Button size="icon-xs" variant="ghost-muted" aria-label="Close issue" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      {issue ? (
        <div className="scrollbar-gutter-both flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <div className="scrollbar-gutter-both md:min-h-0 md:min-w-0 md:flex-1 md:overflow-y-auto">
            <article className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 pt-6 pb-10">
              <IssueTitle
                title={issue.title}
                canWrite={canWrite}
                onSave={(title) => patch({ title })}
              />
              <IssueDescription
                description={issue.description}
                canWrite={canWrite}
                onSave={(description) => patch({ description })}
              />
              <Separator className="my-4" />
              <IssueActivity issue={issue} canComment={canComment} onComment={comment} />
            </article>
          </div>
          <aside
            aria-label="Issue properties"
            className="shrink-0 border-border bg-muted/30 max-md:order-first max-md:border-b md:w-(--thread-details-panel-width) md:overflow-y-auto md:border-s"
          >
            <IssueProperties
              issue={issue}
              options={options ?? NO_OPTIONS}
              canWrite={canWrite}
              onUpdate={(next) => void patch(next)}
            />
          </aside>
        </div>
      ) : query.error ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>The issue could not load</EmptyTitle>
            <EmptyDescription>{query.error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 pt-6">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
    </div>
  );
}
