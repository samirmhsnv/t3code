import { PROVIDER_DISPLAY_NAMES } from "@t3tools/contracts";
import { DownloadIcon, RefreshCwIcon } from "lucide-react";
import { useGT } from "gt-react";
import { useState } from "react";

import { useCheckProviderUpdates, useProviderUpdates } from "../ProviderUpdatesAction";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** Updates agent CLIs such as Claude Code; it never updates T3 Code or its servers. */
export function SidebarProviderUpdateButton() {
  const gt = useGT();
  const providerUpdates = useProviderUpdates();
  const checkProviderUpdates = useCheckProviderUpdates();
  const [pending, setPending] = useState<"check" | "update" | null>(null);
  const names = [
    ...new Set(
      providerUpdates.machines.flatMap((machine) =>
        machine.candidates.map(
          (candidate) => PROVIDER_DISPLAY_NAMES[candidate.driver] ?? candidate.driver,
        ),
      ),
    ),
  ];
  const hasUpdates = names.length > 0;
  const tooltip =
    pending === "check"
      ? gt("Checking for updates…")
      : hasUpdates
        ? `${gt("Update available")}: ${names.join(", ")}`
        : gt("Check for updates");

  const handleClick = () => {
    if (pending !== null) return;
    setPending(hasUpdates ? "update" : "check");
    const run = hasUpdates ? providerUpdates.updateAll() : checkProviderUpdates();
    void run.finally(() => setPending(null));
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={tooltip}
            aria-disabled={pending !== null || undefined}
            className="[-webkit-app-region:no-drag]"
            onClick={handleClick}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        {pending !== null ? (
          <Spinner size="sm" />
        ) : hasUpdates ? (
          <DownloadIcon className="size-3.5 text-update" />
        ) : (
          <RefreshCwIcon className="size-3.5" />
        )}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
