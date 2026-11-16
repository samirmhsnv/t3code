import {
  ISSUE_SOURCE_LABELS,
  type IssuePriority,
  type IssueReference,
  type IssueSource,
} from "@t3tools/contracts";
import { useId, useState, type ReactNode } from "react";

import { usePrimaryEnvironmentId } from "../../state/environments";
import { issueEnvironment, useIssueOptions } from "../../state/issues";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { IssueAvatar, IssuePriorityIcon, IssueStatusIcon, PRIORITY_LABELS } from "./IssueIcons";
import { PRIORITY_ORDER } from "./issueList.logic";

const DEFAULT = "__default__";

function Field({
  id,
  label,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function OptionSelect({
  id,
  value,
  items,
  disabled = false,
  onChange,
}: {
  readonly id: string;
  readonly value: string;
  readonly items: ReadonlyArray<{ value: string; label: string; icon?: ReactNode }>;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}) {
  const current = items.find((item) => item.value === value);
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <SelectTrigger id={id} size="sm">
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
  );
}

/** Files an issue in a configured tracker, then opens it. */
export function NewIssueDialog({
  sources,
  onClose,
  onCreated,
}: {
  /** Trackers with a key saved; the first is chosen to start. */
  readonly sources: ReadonlyArray<IssueSource>;
  readonly onClose: () => void;
  readonly onCreated: (issue: IssueReference) => void;
}) {
  const id = useId();
  const environmentId = usePrimaryEnvironmentId();
  const [source, setSource] = useState<IssueSource | null>(sources[0] ?? null);
  const [containerChoice, setContainerChoice] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IssuePriority>("none");
  const [statusId, setStatusId] = useState(DEFAULT);
  const [assigneeId, setAssigneeId] = useState(DEFAULT);
  const [creating, setCreating] = useState(false);
  const containers = useIssueOptions(source, undefined).data?.containers ?? [];
  const containerId = containerChoice ?? containers[0]?.id;
  const options = useIssueOptions(containerId === undefined ? null : source, containerId).data;
  const create = useAtomCommand(issueEnvironment.create, { label: "create issue" });
  const statusItems = [
    { value: DEFAULT, label: "Default" },
    ...(options?.statuses ?? []).flatMap((status) =>
      status.id === undefined
        ? []
        : [{ value: status.id, label: status.name, icon: <IssueStatusIcon status={status} /> }],
    ),
  ];

  const chooseSource = (next: IssueSource) => {
    setSource(next);
    setContainerChoice(null);
    setStatusId(DEFAULT);
    setAssigneeId(DEFAULT);
  };
  const submit = async () => {
    if (environmentId === null || source === null || containerId === undefined) return;
    if (title.trim() === "") return;
    setCreating(true);
    const result = await create({
      environmentId,
      input: {
        source,
        containerId,
        title: title.trim(),
        ...(description.trim() === "" ? {} : { description }),
        ...(priority === "none" ? {} : { priority }),
        ...(statusId === DEFAULT ? {} : { statusId }),
        ...(assigneeId === DEFAULT ? {} : { assigneeId }),
      },
    });
    setCreating(false);
    if (result._tag === "Success") onCreated({ source: result.value.source, id: result.value.id });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="sm:max-w-xl">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>New issue</DialogTitle>
            <DialogDescription>
              Files the issue in {source ? ISSUE_SOURCE_LABELS[source] : "your tracker"} as you.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field id={`${id}-source`} label="Tracker">
                  <OptionSelect
                    id={`${id}-source`}
                    value={source ?? ""}
                    disabled={sources.length < 2}
                    items={sources.map((value) => ({
                      value,
                      label: ISSUE_SOURCE_LABELS[value],
                    }))}
                    onChange={(value) => {
                      const next = sources.find((candidate) => candidate === value);
                      if (next) chooseSource(next);
                    }}
                  />
                </Field>
                <Field id={`${id}-container`} label={source === "linear" ? "Team" : "Project"}>
                  <OptionSelect
                    id={`${id}-container`}
                    value={containerId ?? ""}
                    disabled={containers.length === 0}
                    items={containers.map((container) => ({
                      value: container.id,
                      label: `${container.name} (${container.key})`,
                    }))}
                    onChange={(value) => {
                      setContainerChoice(value);
                      setStatusId(DEFAULT);
                      setAssigneeId(DEFAULT);
                    }}
                  />
                </Field>
              </div>
              <Field id={`${id}-title`} label="Title">
                <Input
                  id={`${id}-title`}
                  value={title}
                  autoFocus
                  required
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>
              <Field id={`${id}-description`} label="Description">
                <Textarea
                  id={`${id}-description`}
                  value={description}
                  rows={5}
                  placeholder="Markdown"
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field id={`${id}-status`} label="Status">
                  <OptionSelect
                    id={`${id}-status`}
                    value={statusId}
                    items={statusItems}
                    onChange={setStatusId}
                  />
                </Field>
                <Field id={`${id}-priority`} label="Priority">
                  <OptionSelect
                    id={`${id}-priority`}
                    value={priority}
                    items={PRIORITY_ORDER.map((value) => ({
                      value,
                      label: PRIORITY_LABELS[value],
                      icon: <IssuePriorityIcon priority={value} />,
                    }))}
                    onChange={(value) => {
                      const next = PRIORITY_ORDER.find((candidate) => candidate === value);
                      if (next) setPriority(next);
                    }}
                  />
                </Field>
                <Field id={`${id}-assignee`} label="Assignee">
                  <OptionSelect
                    id={`${id}-assignee`}
                    value={assigneeId}
                    items={[
                      {
                        value: DEFAULT,
                        label: "Unassigned",
                        icon: <IssueAvatar person={undefined} />,
                      },
                      ...(options?.members ?? []).map((member) => ({
                        value: member.id,
                        label: member.name,
                        icon: <IssueAvatar person={member} />,
                      })),
                    ]}
                    onChange={setAssigneeId}
                  />
                </Field>
              </div>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={creating || title.trim() === "" || containerId === undefined}
            >
              Create issue
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
