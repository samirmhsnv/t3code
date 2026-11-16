import {
  ISSUE_SOURCE_LABELS,
  IssueSource,
  isSecretReference,
  type EnvironmentId,
  type SecretReference,
  type SettingsSecretValue,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useState } from "react";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { SecretSourceInput, useSecretSources } from "./SecretSourceInput";
import { SettingsRow, SettingsSection } from "./settingsLayout";

const KEY_HELP: Record<IssueSource, string> = {
  linear: "A personal API key from Linear: Settings > Security & access.",
  deckbell:
    "A Deckbell API token (dkb_…) with issues:write and comments:write to edit issues, or issues:read and comments:read to only read them.",
};

function IssueTrackerKeyRow({
  environmentId,
  source,
}: {
  readonly environmentId: EnvironmentId;
  readonly source: IssueSource;
}) {
  const saved = useEnvironmentSettings(
    environmentId,
    (settings) => settings.issueTrackerCredentials[source],
  );
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: `save ${ISSUE_SOURCE_LABELS[source]} API key`,
  });
  const canWrite = useAtomValue(serverEnvironment.updateSettings.permissionAtom(environmentId));
  const secretSources = useSecretSources(environmentId);
  const [draft, setDraft] = useState<string | SecretReference | null>(null);
  const [saving, setSaving] = useState(false);
  const isSaved = saved !== "";
  const value = draft ?? (isSecretReference(saved) ? saved : "");
  const submission = typeof value === "string" ? value.trim() : value;
  const label = ISSUE_SOURCE_LABELS[source];

  const save = async (next: SettingsSecretValue) => {
    setSaving(true);
    const result = await updateSettings({
      environmentId,
      input: { patch: { issueTrackerCredentials: { [source]: next } } },
    });
    setSaving(false);
    if (result._tag === "Success") setDraft(null);
  };

  return (
    <SettingsRow
      title={`${label} API key`}
      description={KEY_HELP[source]}
      control={
        <form
          className="flex w-full min-w-0 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (submission !== "") void save(submission);
          }}
        >
          <fieldset disabled={saving || !canWrite} className="contents">
            <SecretSourceInput
              size="sm"
              aria-label={`${label} API key`}
              environmentId={environmentId}
              configured={isSaved && !isSecretReference(saved)}
              value={value}
              sources={secretSources}
              onChange={(event) => setDraft(event.target.value)}
              onSecretChange={(secret) => setDraft(secret ?? "")}
            />
            {isSaved ? (
              <Button type="button" size="xs" variant="outline" onClick={() => void save("")}>
                Remove
              </Button>
            ) : null}
            <Button type="submit" size="xs" disabled={submission === ""}>
              Save
            </Button>
          </fieldset>
        </form>
      }
    />
  );
}

/** Keys for the Issues page; stored on the primary environment, which fetches the issues. */
export function IssueTrackerSettingsSection() {
  const environmentId = usePrimaryEnvironmentId();
  if (environmentId === null) return null;
  return (
    <SettingsSection id="issue-trackers" title="Issue trackers">
      {IssueSource.literals.map((source) => (
        <IssueTrackerKeyRow key={source} environmentId={environmentId} source={source} />
      ))}
    </SettingsSection>
  );
}
