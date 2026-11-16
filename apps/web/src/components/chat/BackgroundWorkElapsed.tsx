import { formatDuration } from "@t3tools/shared/orchestrationTiming";
import { ClockIcon } from "lucide-react";
import { tickTextContent } from "~/lib/tickTextContent";
import { cn } from "~/lib/utils";

/** Time since the work started, ticking through the DOM so nothing around it re-renders. */
export function BackgroundWorkElapsed(props: {
  readonly startedAtMs: number;
  readonly live: boolean;
  readonly className?: string;
}) {
  const { startedAtMs } = props;
  return (
    <span className={cn("flex shrink-0 items-center gap-1", props.className)}>
      <ClockIcon aria-hidden className="size-3" />
      <span
        ref={tickTextContent(
          (nowMs) => formatDuration(Math.max(1_000, nowMs - startedAtMs)),
          props.live,
        )}
        className="tabular-nums"
      />
    </span>
  );
}
