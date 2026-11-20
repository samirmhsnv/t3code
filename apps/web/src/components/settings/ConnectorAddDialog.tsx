import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  ProjectId,
  type EnvironmentId,
  type McpServerProvider,
  type McpServerTransport,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import { T, useGT } from "gt-react";
import { useId, useState } from "react";

import { useEnvironmentProviders } from "../../state/environments";
import { useProjects } from "../../state/entities";
import { mcpServerAdd } from "../../state/mcpServers";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
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
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { Textarea } from "../ui/textarea";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { parseVariableLines, splitCommandLine } from "./connectors.logic";

const PROVIDER_NAMES = { claudeAgent: "Claude", codex: "Codex" } as const;
const ALL_PROJECTS = "";
const NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;

export function ConnectorAddDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAdded: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open ? (
        <ConnectorAddForm
          environmentId={props.environmentId}
          onClose={() => props.onOpenChange(false)}
          onAdded={props.onAdded}
        />
      ) : null}
    </Dialog>
  );
}

function ConnectorAddForm(props: {
  readonly environmentId: EnvironmentId;
  readonly onClose: () => void;
  readonly onAdded: () => void;
}) {
  const gt = useGT();
  const ids = useId();
  const providers = (useEnvironmentProviders().get(props.environmentId) ?? [])
    .flatMap((provider) => {
      const driver: McpServerProvider | null =
        provider.driver === "claudeAgent"
          ? "claudeAgent"
          : provider.driver === "codex"
            ? "codex"
            : null;
      return provider.enabled && driver !== null
        ? [
            {
              instanceId: provider.instanceId,
              driver,
              label: provider.displayName ?? PROVIDER_NAMES[driver],
            },
          ]
        : [];
    })
    .sort((a, b) => Number(a.driver === "codex") - Number(b.driver === "codex"));
  const projects = useProjects().filter(
    (project) => project.environmentId === props.environmentId && project.isScratch !== true,
  );
  const add = useAtomCommand(mcpServerAdd, { reportFailure: false });

  const [instanceId, setInstanceId] = useState<ProviderInstanceId | null>(
    providers[0]?.instanceId ?? null,
  );
  const provider = providers.find((candidate) => candidate.instanceId === instanceId) ?? null;
  const isCodex = provider?.driver === "codex";
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpServerTransport>("stdio");
  const [target, setTarget] = useState("");
  const [projectId, setProjectId] = useState<string>(ALL_PROJECTS);
  const [shareWithRepo, setShareWithRepo] = useState(false);
  const [variables, setVariables] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const effectiveTransport = isCodex && transport === "sse" ? "http" : transport;
  const isStdio = effectiveTransport === "stdio";
  const trimmedName = name.trim();
  const nameInvalid = trimmedName.length > 0 && !NAME_PATTERN.test(trimmedName);
  const canSubmit =
    provider !== null && trimmedName.length > 0 && !nameInvalid && target.trim().length > 0;

  const submit = async () => {
    if (provider === null) return;
    const words = isStdio ? splitCommandLine(target) : [target.trim()];
    const [command, ...args] = words;
    if (command === undefined || command.length === 0) {
      setFailure(gt("Enter the command that starts the server."));
      return;
    }
    if (!isStdio && !/^https?:\/\//i.test(command)) {
      setFailure(gt("Enter a URL that starts with https:// or http://."));
      return;
    }
    const showVariables = isStdio || !isCodex;
    const parsed = showVariables
      ? parseVariableLines(variables, isStdio ? "=" : ":")
      : { variables: [] };
    if ("badLine" in parsed) {
      setFailure(gt("Line {line} needs a name and a value.", { line: parsed.badLine }));
      return;
    }
    setBusy(true);
    setFailure(null);
    const scoped = !isCodex && projectId !== ALL_PROJECTS;
    const result = await add({
      environmentId: props.environmentId,
      input: {
        provider: provider.driver,
        providerInstanceId: provider.instanceId,
        name: trimmedName,
        scope: scoped ? (shareWithRepo ? "project" : "local") : "user",
        ...(scoped ? { projectId: ProjectId.make(projectId) } : {}),
        transport: effectiveTransport,
        target: command,
        args,
        env: isStdio ? parsed.variables : [],
        headers: isStdio ? [] : parsed.variables,
      },
    });
    setBusy(false);
    if (result._tag === "Success") {
      props.onAdded();
      props.onClose();
      return;
    }
    const error = squashAtomCommandFailure(result);
    setFailure(error instanceof Error ? error.message : gt("The server couldn't be added."));
  };

  const fieldLabel = "text-xs font-medium text-foreground";
  const hint = "text-xs text-muted-foreground";

  return (
    <DialogPopup className="max-w-lg">
      <DialogHeader>
        <DialogTitle>
          <T>Add an MCP server</T>
        </DialogTitle>
        <DialogDescription>
          <T>The agent saves it in its own config, the same as its CLI would.</T>
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <form
          id={`${ids}-form`}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit && !busy) void submit();
          }}
        >
          <fieldset disabled={busy} className="contents">
            {providers.length > 1 ? (
              <div className="space-y-1.5">
                <span className={fieldLabel}>
                  <T>Agent</T>
                </span>
                <Select
                  value={instanceId ?? ""}
                  onValueChange={(value) => {
                    if (value) setInstanceId(value as ProviderInstanceId);
                  }}
                >
                  <SelectTrigger aria-label={gt("Agent")} size="sm">
                    <SelectValue>{provider?.label}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {providers.map((candidate) => (
                      <SelectItem key={candidate.instanceId} value={candidate.instanceId}>
                        {candidate.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label htmlFor={`${ids}-name`} className={fieldLabel}>
                <T>Name</T>
              </label>
              <Input
                id={`${ids}-name`}
                size="sm"
                autoFocus
                value={name}
                placeholder="github"
                aria-invalid={nameInvalid || undefined}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              {nameInvalid ? (
                <p className="text-xs text-destructive-foreground">
                  <T>Use letters, numbers, dots, dashes and underscores.</T>
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <span className={fieldLabel}>
                <T>Connects through</T>
              </span>
              <ToggleGroup
                aria-label={gt("Transport")}
                variant="segmented"
                value={[effectiveTransport]}
                onValueChange={(next) => {
                  const value = next[0];
                  if (value === "stdio" || value === "http" || value === "sse") setTransport(value);
                }}
              >
                <Toggle value="stdio">
                  <T>Command</T>
                </Toggle>
                <Toggle value="http">HTTP</Toggle>
                {isCodex ? null : <Toggle value="sse">SSE</Toggle>}
              </ToggleGroup>
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`${ids}-target`} className={fieldLabel}>
                {isStdio ? <T>Command</T> : <T>URL</T>}
              </label>
              <Input
                id={`${ids}-target`}
                size="sm"
                value={target}
                placeholder={
                  isStdio
                    ? "npx -y @modelcontextprotocol/server-github"
                    : "https://mcp.example.com/mcp"
                }
                onChange={(event) => setTarget(event.currentTarget.value)}
              />
              {isStdio ? (
                <p className={hint}>
                  <T>It runs on this environment whenever an agent starts.</T>
                </p>
              ) : null}
            </div>

            {isCodex ? null : (
              <div className="space-y-1.5">
                <span className={fieldLabel}>
                  <T>Available in</T>
                </span>
                <Select
                  value={projectId}
                  onValueChange={(value) => setProjectId(value ?? ALL_PROJECTS)}
                >
                  <SelectTrigger aria-label={gt("Available in")} size="sm">
                    <SelectValue>
                      {projectId === ALL_PROJECTS
                        ? gt("All projects")
                        : projects.find((project) => project.id === projectId)?.title}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value={ALL_PROJECTS}>{gt("All projects")}</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.title}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                {projectId !== ALL_PROJECTS ? (
                  <label className="flex cursor-pointer items-start gap-2.5 pt-1">
                    <Checkbox
                      className="mt-0.5"
                      checked={shareWithRepo}
                      onCheckedChange={(checked) => setShareWithRepo(checked === true)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-foreground">
                        <T>Share it through the repo's .mcp.json</T>
                      </span>
                      <span className={`block ${hint}`}>
                        <T>Anyone who opens the repo gets it. Otherwise only you do.</T>
                      </span>
                    </span>
                  </label>
                ) : null}
              </div>
            )}

            {isStdio || !isCodex ? (
              <div className="space-y-1.5">
                <label htmlFor={`${ids}-variables`} className={fieldLabel}>
                  {isStdio ? <T>Environment variables</T> : <T>Headers</T>}
                </label>
                <Textarea
                  id={`${ids}-variables`}
                  rows={3}
                  value={variables}
                  placeholder={isStdio ? "GITHUB_TOKEN=…" : "Authorization: Bearer …"}
                  onChange={(event) => setVariables(event.currentTarget.value)}
                />
                <p className={hint}>
                  {isStdio ? (
                    <T>Optional. One NAME=value per line.</T>
                  ) : (
                    <T>Optional. One Name: value per line.</T>
                  )}
                </p>
              </div>
            ) : null}

            {failure ? <p className="text-sm text-destructive-foreground">{failure}</p> : null}
          </fieldset>
        </form>
      </DialogPanel>
      <DialogFooter variant="bare">
        <Button variant="outline" disabled={busy} onClick={props.onClose}>
          <T>Cancel</T>
        </Button>
        <Button type="submit" form={`${ids}-form`} disabled={!canSubmit || busy}>
          {busy ? <Spinner size="sm" /> : null}
          <T>Add server</T>
        </Button>
      </DialogFooter>
    </DialogPopup>
  );
}
