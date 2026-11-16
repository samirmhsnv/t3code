import {
  ISSUE_SOURCE_LABELS,
  type IssueDetail,
  type IssueOptions,
  type IssueReference,
  type IssueUpdatePatch,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { ExternalLinkIcon, PencilIcon, TagIcon, XIcon } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";

import { usePrimaryEnvironmentId } from "../../state/environments";
import { issueEnvironment, useIssueDetail, useIssueOptions } from "../../state/issues";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import ChatMarkdown from "../ChatMarkdown";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
import { Menu, MenuCheckboxItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";
import { IssueAvatar, IssuePriorityIcon, IssueStatusIcon, PRIORITY_LABELS } from "./IssueIcons";
import { PRIORITY_ORDER } from "./issueList.logic";

const UNASSIGNED = "__unassigned__";
const NO_OPTIONS: IssueOptions = { containers: [], statuses: [], members: [], labels: [] };

interface PickerItem {
  readonly value: string;
  readonly label: string;
  readonly icon: ReactNode;
}

function PropertySelect({
  label,
  value,
  items,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly items: ReadonlyArray<PickerItem>;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}) {
  const current = items.find((item) => item.value === value);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next !== null && next !== value) onChange(next);
        }}
      >
        <SelectTrigger size="xs" variant="ghost" className="w-auto min-w-0" aria-label={label}>
          <span className="flex min-w-0 items-center gap-1.5">
            {current?.icon}
            <span className="truncate">{current?.label ?? "…"}</span>
          </span>
        </SelectTrigger>
        <SelectPopup alignItemWithTrigger={false}>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              <span className="flex items-center gap-1.5">
                {item.icon}
                {item.label}
              </span>
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  );
}

function LabelChips({ labels }: { readonly labels: IssueDetail["labels"] }) {
  return labels.map((label) => (
    <Badge
      key={label.id}
      size="sm"
      variant={label.color ? "label" : "secondary"}
      {...(label.color ? { style: { "--label": label.color } as CSSProperties } : {})}
    >
      {label.name}
    </Badge>
  ));
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
  const statuses = options.statuses.some((status) => status.id === issue.status.id)
    ? options.statuses
    : [issue.status, ...options.statuses];
  const members =
    issue.assignee === undefined ||
    options.members.some((member) => member.id === issue.assignee?.id)
      ? options.members
      : [issue.assignee, ...options.members];
  const labelIds = new Set(issue.labels.map((label) => label.id));
  const labels = [
    ...issue.labels.filter((label) => !options.labels.some((option) => option.id === label.id)),
    ...options.labels,
  ];
  return (
    <div className="flex flex-col gap-1">
      <PropertySelect
        label="Status"
        value={issue.status.id ?? issue.status.name}
        disabled={!canWrite || options.statuses.length === 0}
        items={statuses.map((status) => ({
          value: status.id ?? status.name,
          label: status.name,
          icon: <IssueStatusIcon status={status} />,
        }))}
        onChange={(statusId) => onUpdate({ statusId })}
      />
      <PropertySelect
        label="Priority"
        value={issue.priority}
        disabled={!canWrite}
        items={PRIORITY_ORDER.map((priority) => ({
          value: priority,
          label: PRIORITY_LABELS[priority],
          icon: <IssuePriorityIcon priority={priority} />,
        }))}
        onChange={(priority) => {
          const next = PRIORITY_ORDER.find((candidate) => candidate === priority);
          if (next) onUpdate({ priority: next });
        }}
      />
      <PropertySelect
        label="Assignee"
        value={issue.assignee?.id ?? UNASSIGNED}
        disabled={!canWrite}
        items={[
          {
            value: UNASSIGNED,
            label: "Unassigned",
            icon: <IssueAvatar person={undefined} />,
          },
          ...members.map((member) => ({
            value: member.id,
            label: member.name,
            icon: <IssueAvatar person={member} />,
          })),
        ]}
        onChange={(assigneeId) =>
          onUpdate({ assigneeId: assigneeId === UNASSIGNED ? null : assigneeId })
        }
      />
      <div className="flex min-w-0 items-start gap-3">
        <span className="w-20 shrink-0 pt-1 text-xs text-muted-foreground">Labels</span>
        <div className="flex min-w-0 flex-wrap items-center gap-1 pt-0.5">
          <LabelChips labels={issue.labels} />
          <Menu>
            <MenuTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label="Edit labels"
                  disabled={!canWrite || labels.length === 0}
                />
              }
            >
              <TagIcon />
            </MenuTrigger>
            <MenuPopup align="start">
              {labels.map((label) => (
                <MenuCheckboxItem
                  key={label.id}
                  checked={labelIds.has(label.id)}
                  onCheckedChange={(checked) => {
                    const next = new Set(labelIds);
                    if (checked) next.add(label.id);
                    else next.delete(label.id);
                    onUpdate({ labelIds: [...next] });
                  }}
                >
                  {label.name}
                </MenuCheckboxItem>
              ))}
            </MenuPopup>
          </Menu>
        </div>
      </div>
      {issue.container || issue.project ? (
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <span className="w-20 shrink-0 text-xs text-muted-foreground">
            {issue.source === "linear" ? "Team" : "Project"}
          </span>
          <span className="truncate">
            {[issue.container?.name, issue.project].filter(Boolean).join(" · ")}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function IssueTitle({
  issue,
  canWrite,
  onSave,
}: {
  readonly issue: IssueDetail;
  readonly canWrite: boolean;
  readonly onSave: (title: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null)
    return (
      <div className="group flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold text-foreground">{issue.title}</h2>
        {canWrite ? (
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Edit title"
            onClick={() => setDraft(issue.title)}
          >
            <PencilIcon />
          </Button>
        ) : null}
      </div>
    );
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const title = draft.trim();
        if (title === "" || title === issue.title) return setDraft(null);
        if (await onSave(title)) setDraft(null);
      }}
    >
      <Input
        aria-label="Title"
        value={draft}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setDraft(null);
        }}
      />
      <Button type="submit" size="xs">
        Save
      </Button>
    </form>
  );
}

function IssueDescription({
  issue,
  canWrite,
  onSave,
}: {
  readonly issue: IssueDetail;
  readonly canWrite: boolean;
  readonly onSave: (description: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null)
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await onSave(draft)) setDraft(null);
        }}
      >
        <Textarea
          aria-label="Description"
          value={draft}
          rows={6}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" size="xs" variant="ghost" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button type="submit" size="xs">
            Save
          </Button>
        </div>
      </form>
    );
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">Description</h3>
        {canWrite ? (
          <Button size="xs" variant="ghost-muted" onClick={() => setDraft(issue.description)}>
            Edit
          </Button>
        ) : null}
      </div>
      {issue.description.trim() === "" ? (
        <p className="text-sm text-muted-foreground">No description.</p>
      ) : (
        <ChatMarkdown text={issue.description} cwd={undefined} lineBreaks />
      )}
    </section>
  );
}

function IssueComments({
  issue,
  canWrite,
  onComment,
}: {
  readonly issue: IssueDetail;
  readonly canWrite: boolean;
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
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium text-muted-foreground">
        Activity · {issue.comments.length} {issue.comments.length === 1 ? "comment" : "comments"}
      </h3>
      <ol className="flex flex-col gap-3">
        {issue.comments.map((comment) => (
          <li key={comment.id} className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="mb-1 flex items-center gap-2 text-xs">
              <IssueAvatar person={comment.author} />
              <span className="font-medium text-foreground">
                {comment.author?.name ?? "Unknown"}
              </span>
              <time dateTime={comment.createdAt} className="text-muted-foreground">
                {formatRelativeTimeLabel(comment.createdAt)}
              </time>
            </div>
            <ChatMarkdown text={comment.body} cwd={undefined} lineBreaks />
          </li>
        ))}
      </ol>
      {canWrite ? (
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
          <div className="flex justify-end">
            <Button type="submit" size="xs" disabled={sending || body.trim() === ""}>
              Comment
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

/** One issue read and edited in place; every write re-reads it and the list. */
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
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="font-mono text-xs text-muted-foreground">{issue?.identifier ?? "…"}</span>
        <div className="min-w-0 flex-1" />
        {issue ? (
          <Button
            size="xs"
            variant="ghost"
            render={<a href={issue.url} target="_blank" rel="noreferrer noopener" />}
          >
            <ExternalLinkIcon />
            Open in {label}
          </Button>
        ) : null}
        <Button size="icon-xs" variant="ghost-muted" aria-label="Close issue" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {issue ? (
          <div className="flex flex-col gap-6 px-5 py-5">
            <IssueTitle issue={issue} canWrite={canWrite} onSave={(title) => patch({ title })} />
            <IssueProperties
              issue={issue}
              options={options ?? NO_OPTIONS}
              canWrite={canWrite}
              onUpdate={(next) => void patch(next)}
            />
            <IssueDescription
              issue={issue}
              canWrite={canWrite}
              onSave={(description) => patch({ description })}
            />
            <IssueComments issue={issue} canWrite={canComment} onComment={comment} />
            {issue.creator ? (
              <p className="text-xs text-muted-foreground">
                Created by {issue.creator.name} {formatRelativeTimeLabel(issue.createdAt)}
              </p>
            ) : null}
          </div>
        ) : query.error ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>The issue could not load</EmptyTitle>
              <EmptyDescription>{query.error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3 px-5 py-5">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
