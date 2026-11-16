import type { ServerProvider } from "@t3tools/contracts";

import { useNowMinute } from "../../hooks/useNowMinute";
import { formatResetsIn, headlineWindow, usageTextClass } from "../usage/providerUsageHeadline";
import { UsageMeter } from "../usage/UsageMeter";

/** "Claude Max Subscription" → "Max": the provider name is already beside it. */
function planLabel(provider: ServerProvider, displayName: string): string | null {
  if (provider.auth.status !== "authenticated") return null;
  const label = provider.auth.label?.trim();
  if (!label) return null;
  const words = label.split(/\s+/).filter((word) => !/^subscription$/i.test(word));
  if (words[0]?.toLowerCase() === displayName.toLowerCase()) words.shift();
  return words.join(" ") || null;
}

function ProviderUsage(props: { provider: ServerProvider }) {
  const now = Date.parse(useNowMinute());
  const window = headlineWindow(props.provider);
  if (!window) return null;
  const used = Math.round(window.usedPercent);
  const resetsIn = formatResetsIn(window.resetsAt, now);
  return (
    <span className="flex min-w-0 shrink items-center gap-1.5 truncate tabular-nums">
      <span className="truncate">{window.label}</span>
      <UsageMeter percent={used} className="w-8" />
      <span className={usageTextClass(used, "text-muted-foreground")}>{used}%</span>
      {resetsIn !== null ? <span className="truncate">· resets in {resetsIn}</span> : null}
    </span>
  );
}

/** Names the list's tab; a provider's tab adds its plan and headline limit. */
export function ModelPickerListHeader(props: {
  title: string;
  provider?: ServerProvider | undefined;
}) {
  const plan = props.provider ? planLabel(props.provider, props.title) : null;
  return (
    <div className="flex h-8 shrink-0 items-center gap-3 px-4 pt-1 text-muted-foreground text-xs">
      <span className="min-w-0 shrink-0 truncate">
        {props.title}
        {plan ? ` · ${plan}` : null}
      </span>
      {props.provider ? (
        <span className="ms-auto flex min-w-0 justify-end">
          <ProviderUsage provider={props.provider} />
        </span>
      ) : null}
    </div>
  );
}
