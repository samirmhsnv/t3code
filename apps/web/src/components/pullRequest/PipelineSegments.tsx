import { cn } from "~/lib/utils";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  PIPELINE_STAGE_LABELS,
  type Pipeline,
  type PipelineSegmentState,
  type PipelineStageName,
} from "./pipelineStage.logic";

const SEGMENT_CLASS: Record<PipelineSegmentState, string> = {
  done: "bg-success",
  active: "bg-info",
  blocked: "bg-warning",
  pending: "bg-muted-foreground/25",
};

const STAGE_ORDER: readonly PipelineStageName[] = ["implement", "review", "ci", "merge"];

function pipelineSummary(pipeline: Pipeline): string {
  return pipeline.detail === null ? pipeline.label : `${pipeline.label} · ${pipeline.detail}`;
}

/** Four static bars for Implement, Review, CI and Merge. */
function PipelineSegments({
  pipeline,
  size = "default",
  className,
}: {
  pipeline: Pipeline;
  size?: "default" | "compact";
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="img"
            data-pipeline-segments=""
            aria-label={`Pull request stage: ${pipelineSummary(pipeline)}`}
            className={cn("inline-flex shrink-0 items-center gap-0.5", className)}
          />
        }
      >
        {pipeline.segments.map((segment, index) => (
          <span
            key={STAGE_ORDER[index]}
            className={cn(
              "h-1 rounded-full",
              size === "compact" ? "w-1.5" : "w-4",
              SEGMENT_CLASS[segment],
            )}
          />
        ))}
      </TooltipTrigger>
      <TooltipPopup side="top">
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{pipelineSummary(pipeline)}</span>
          <span className="text-muted-foreground">
            {STAGE_ORDER.map((stage, index) => (
              <span key={stage}>
                {index > 0 ? " · " : null}
                <span
                  className={cn(
                    pipeline.segments[index] === "blocked" && "text-warning-foreground",
                  )}
                >
                  {PIPELINE_STAGE_LABELS[stage]}
                </span>
              </span>
            ))}
          </span>
        </span>
      </TooltipPopup>
    </Tooltip>
  );
}

/** Segments with the current stage named beside them, for rows with room to spare. */
export function PipelineStageLabel({ pipeline }: { pipeline: Pipeline }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <PipelineSegments pipeline={pipeline} />
      <span
        className={cn(
          "whitespace-nowrap",
          pipeline.blocked ? "text-warning-foreground" : "text-muted-foreground",
        )}
      >
        <span className="font-medium">{pipeline.label}</span>
        {pipeline.detail === null ? null : <span> · {pipeline.detail}</span>}
      </span>
    </span>
  );
}
