import { useAtomValue } from "@effect/atom-react";
import { useRouter } from "@tanstack/react-router";
import {
  threadPullRequestKeyOf,
  visibleThreadPullRequests,
} from "@t3tools/client-runtime/thread-pull-requests";
import type { ScopedThreadRef } from "@t3tools/contracts";
import {
  ArrowRightIcon,
  MessageSquareIcon,
  ShieldAlertIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { Atom } from "effect/reactivity";

import { environmentThreadShells } from "../../state/threads";
import { buildThreadRouteParams } from "../../threadRoutes";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  attentionIsEmpty,
  summarizeAttention,
  type AttentionSegment,
  type AttentionSummary,
} from "./attentionStrip.logic";

// Quiet shells skip streaming ticks; the equality keeps the strip still until a count or target moves.
const attentionSummaryAtom = Atom.make((get): AttentionSummary => {
  const threads = get(environmentThreadShells.quietThreadShellsAtom)
    .filter((thread) => thread.archivedAt === null)
    .map((thread) => ({
      ref: { environmentId: thread.environmentId, threadId: thread.id },
      title: thread.title,
      hasPendingApprovals: thread.hasPendingApprovals,
      hasPendingUserInput: thread.hasPendingUserInput,
      pullRequests: visibleThreadPullRequests(thread.pullRequests).flatMap((link) =>
        link.snapshot === null
          ? []
          : [
              {
                key: threadPullRequestKeyOf(link),
                number: link.number,
                state: link.snapshot.state,
                isDraft: link.snapshot.isDraft,
                reviewDecision: link.snapshot.reviewDecision,
                checksState: link.snapshot.checksState,
                mergeability: link.snapshot.mergeability,
              },
            ],
      ),
    }));
  return summarizeAttention(threads);
}).pipe(
  Atom.withEquality(
    (previous: AttentionSummary, next: AttentionSummary) =>
      JSON.stringify(previous) === JSON.stringify(next),
  ),
);

function AttentionSegmentButton({
  icon: Icon,
  iconClassName,
  segment,
  label,
  description,
  onOpen,
}: {
  icon: LucideIcon;
  iconClassName: string;
  segment: AttentionSegment;
  label: string;
  description: string;
  onOpen: (ref: ScopedThreadRef | null) => void;
}) {
  if (segment.count === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost-muted" size="xs" onClick={() => onOpen(segment.first)} />}
      >
        <Icon aria-hidden className={iconClassName} />
        <span className="font-medium text-foreground tabular-nums">{segment.count}</span>
        {label}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{description} Click to open the first one.</TooltipPopup>
    </Tooltip>
  );
}

/** What needs you across every thread and linked pull request; hidden when nothing does. */
export function AttentionStrip() {
  const router = useRouter();
  const summary = useAtomValue(attentionSummaryAtom);
  if (attentionIsEmpty(summary)) return null;
  const open = (ref: ScopedThreadRef | null) => {
    if (ref === null) return;
    void router.navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  };
  const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);
  return (
    <div
      role="region"
      aria-label="Needs attention"
      className="flex h-8 shrink-0 items-center gap-0.5 overflow-hidden border-b border-border/60 bg-background pl-(--workspace-gutter-start) pr-(--workspace-gutter-end)"
    >
      <AttentionSegmentButton
        icon={ShieldAlertIcon}
        iconClassName="text-warning-foreground"
        segment={summary.approval}
        label="need approval"
        description={plural(
          summary.approval.count,
          "1 thread waits for your approval.",
          `${summary.approval.count} threads wait for your approval.`,
        )}
        onOpen={open}
      />
      <AttentionSegmentButton
        icon={MessageSquareIcon}
        iconClassName="text-info-foreground"
        segment={summary.input}
        label="waiting for input"
        description={plural(
          summary.input.count,
          "1 thread asked you a question.",
          `${summary.input.count} threads asked you a question.`,
        )}
        onOpen={open}
      />
      <AttentionSegmentButton
        icon={XIcon}
        iconClassName="text-error-foreground"
        segment={summary.ciFailing}
        label="CI failing"
        description={plural(
          summary.ciFailing.count,
          "1 linked pull request has failing checks.",
          `${summary.ciFailing.count} linked pull requests have failing checks.`,
        )}
        onOpen={open}
      />
      <AttentionSegmentButton
        icon={PullRequestGlyph.merged}
        iconClassName="text-success-foreground"
        segment={summary.readyToMerge}
        label="ready to merge"
        description={plural(
          summary.readyToMerge.count,
          "1 linked pull request is approved, green and mergeable.",
          `${summary.readyToMerge.count} linked pull requests are approved, green and mergeable.`,
        )}
        onOpen={open}
      />
      {summary.next === null ? null : (
        <span className="ml-auto flex min-w-0 items-center gap-1.5 ps-2">
          <span className="shrink-0 text-xs text-muted-foreground">Next</span>
          <Button
            variant="outline"
            size="xs"
            className="min-w-0"
            onClick={() => open(summary.next?.ref ?? null)}
          >
            <span className="truncate">{summary.next.label}</span>
            <ArrowRightIcon aria-hidden />
          </Button>
        </span>
      )}
    </div>
  );
}
