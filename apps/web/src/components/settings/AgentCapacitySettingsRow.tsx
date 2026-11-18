import { DEFAULT_AGENT_CAPACITY_LIMIT } from "@t3tools/contracts/settings";

import { useClientSettings } from "../../hooks/useSettings";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";
import { useUpdateScopedSettings } from "./useScopedSettings";

/** The status bar's working count reads against this, such as 3/8. */
export function AgentCapacitySettingsRow() {
  const limit = useClientSettings((settings) => settings.agentCapacityLimit);
  const updateSettings = useUpdateScopedSettings();
  const searchableSetting = useSearchableSetting();
  return (
    <SettingsRow
      {...searchableSetting("agent-capacity")}
      devicePreference
      description="How many agents you want working at once. The status bar shows working agents against this number."
      resetAction={
        limit !== DEFAULT_AGENT_CAPACITY_LIMIT ? (
          <SettingResetButton
            ariaLabel="Reset agent capacity to default"
            onClick={() => updateSettings({ agentCapacityLimit: DEFAULT_AGENT_CAPACITY_LIMIT })}
          />
        ) : null
      }
      control={
        <NumberField
          value={limit}
          min={1}
          max={64}
          step={1}
          size="sm"
          className="w-32"
          onValueCommitted={(next) => {
            if (next === null) return;
            const value = Math.min(64, Math.max(1, Math.round(next)));
            if (value !== limit) updateSettings({ agentCapacityLimit: value });
          }}
        >
          <NumberFieldGroup>
            <NumberFieldDecrement aria-label="Decrease agent capacity" />
            <NumberFieldInput aria-label="Agent capacity" />
            <NumberFieldIncrement aria-label="Increase agent capacity" />
          </NumberFieldGroup>
        </NumberField>
      }
    />
  );
}
