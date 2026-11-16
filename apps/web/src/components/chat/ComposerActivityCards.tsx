import type { ProviderApprovalDecision, RuntimeRequestId } from "@t3tools/contracts";
import {
  FULL_ACCESS_OVERRIDE_QUESTION,
  fullAccessOverrideExplanation,
} from "@t3tools/client-runtime/state/thread-requests";
import { formatDuration } from "@t3tools/shared/orchestrationTiming";
import { ClockIcon, ShieldIcon, SquareIcon } from "lucide-react";
import { tickTextContent } from "~/lib/tickTextContent";
import type { PendingApproval } from "../../session-logic";
import { Button, InlineButton } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ComposerBanner } from "./ComposerBanner";
import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";
import type { BackgroundWorkCardItem } from "./ThreadActivityBanners";
import { APPROVAL_PRESENTATION } from "./TimelinePendingApprovalRow";

/** A pending approval, as its own card above the composer. */
function PendingApprovalCard({
  approval,
  disabled,
  isResponding,
  onRespondToApproval,
}: {
  readonly approval: PendingApproval;
  readonly disabled: boolean;
  readonly isResponding: boolean;
  readonly onRespondToApproval: (
    requestId: RuntimeRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
}) {
  const presentation = APPROVAL_PRESENTATION[approval.requestKind];
  const canRespond = approval.responseCapability === "live";
  return (
    <ComposerBanner.Root
      detached
      variant="warning"
      density="spacious"
      role="group"
      aria-label={presentation.label}
      data-v2-item-type="approval_request"
    >
      <ComposerBanner.Row layout="approval">
        <ComposerBanner.Icon>
          <ShieldIcon />
        </ComposerBanner.Icon>
        <ComposerBanner.Content className="flex-col items-start gap-1">
          <span className="font-medium text-warning">
            Waiting for approval · {presentation.detailLabel}
          </span>
          <code
            aria-label={presentation.detailLabel}
            className="block max-h-40 w-full min-w-0 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-foreground select-text! wrap-anywhere [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
            data-approval-detail="complete"
            tabIndex={0}
          >
            {approval.detail || presentation.label}
          </code>
          {approval.appName ? (
            <span className="text-muted-foreground wrap-anywhere">{approval.appName}</span>
          ) : null}
          {approval.reason ? (
            <span className="text-muted-foreground select-text wrap-anywhere">
              {approval.reason}
            </span>
          ) : null}
          {canRespond ? null : (
            <span className="text-warning">
              Provider process is gone. Interrupt or restart the run to respond.
            </span>
          )}
          {approval.fullAccessOverride ? (
            <Popover>
              <PopoverTrigger openOnHover render={<InlineButton tone="muted" />}>
                {FULL_ACCESS_OVERRIDE_QUESTION}
              </PopoverTrigger>
              <PopoverPopup
                aria-label={FULL_ACCESS_OVERRIDE_QUESTION}
                tooltipStyle
                side="top"
                className="max-w-[min(22rem,calc(100vw-2rem))] whitespace-normal"
              >
                {fullAccessOverrideExplanation(approval.fullAccessOverride)}
              </PopoverPopup>
            </Popover>
          ) : null}
        </ComposerBanner.Content>
        {canRespond ? (
          <ComposerBanner.Actions>
            <ComposerPendingApprovalActions
              presentation="card"
              requestId={approval.requestId}
              disabled={disabled}
              isResponding={isResponding}
              canRespond={canRespond}
              options={approval.options}
              onRespondToApproval={onRespondToApproval}
            />
          </ComposerBanner.Actions>
        ) : null}
      </ComposerBanner.Row>
    </ComposerBanner.Root>
  );
}

/** Background commands and subagents, as a one-line card above the composer. */
export function BackgroundWorkCard({ item }: { readonly item: BackgroundWorkCardItem }) {
  const { startedAtMs } = item;
  return (
    <ComposerBanner.Root detached density="comfortable" data-background-work-card>
      <ComposerBanner.Row>
        <ComposerBanner.Icon>
          <span className="size-2 rounded-full border-2 border-info" />
        </ComposerBanner.Icon>
        <ComposerBanner.Content className="gap-2 whitespace-nowrap">
          <span className="shrink-0 font-medium text-info">
            {item.waiting ? "Waiting" : "Running"}
          </span>
          <span className="min-w-0 shrink truncate text-foreground">{item.title}</span>
          {item.detail ? (
            <span className="w-0 min-w-0 grow truncate text-muted-foreground">{item.detail}</span>
          ) : null}
        </ComposerBanner.Content>
        <ComposerBanner.Actions className="flex-nowrap gap-3">
          {startedAtMs === null ? null : (
            <span className="flex items-center gap-1 border-s border-border ps-3 text-muted-foreground">
              <ClockIcon aria-hidden className="size-3" />
              <span
                ref={tickTextContent(
                  (nowMs) => formatDuration(Math.max(1_000, nowMs - startedAtMs)),
                  true,
                )}
                className="tabular-nums"
              />
            </span>
          )}
          {item.details}
          <Button
            size="xs"
            variant="outline"
            disabled={item.stopDisabled}
            onClick={() => void item.onStop()}
          >
            <SquareIcon />
            {item.stopping ? "Stopping..." : "Stop"}
          </Button>
        </ComposerBanner.Actions>
      </ComposerBanner.Row>
    </ComposerBanner.Root>
  );
}

/**
 * What is live in the thread and needs a hand, stacked above the composer: approvals the agent is
 * waiting on, then background work.
 */
export function ComposerActivityCards({
  approvals,
  respondingRequestIds,
  disabled,
  onRespondToApproval,
  backgroundWork,
}: {
  readonly approvals: ReadonlyArray<PendingApproval>;
  readonly respondingRequestIds: ReadonlyArray<RuntimeRequestId>;
  readonly disabled: boolean;
  readonly onRespondToApproval: (
    requestId: RuntimeRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
  readonly backgroundWork: BackgroundWorkCardItem | null;
}) {
  if (approvals.length === 0 && backgroundWork === null) return null;
  return (
    <div className="mx-auto mb-2 flex w-full min-w-0 max-w-(--chat-content-max-width) flex-col gap-2">
      {approvals.map((approval) => (
        <PendingApprovalCard
          key={approval.requestId}
          approval={approval}
          disabled={disabled}
          isResponding={respondingRequestIds.includes(approval.requestId)}
          onRespondToApproval={onRespondToApproval}
        />
      ))}
      {backgroundWork ? <BackgroundWorkCard item={backgroundWork} /> : null}
    </div>
  );
}
