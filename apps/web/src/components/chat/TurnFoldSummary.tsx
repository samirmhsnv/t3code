import { FileTextIcon, SquarePenIcon } from "lucide-react";
import type { ReactNode } from "react";
import { DiffStatLabel } from "./DiffStatLabel";
import type { WorkSummary } from "./TimelineWorkGroupRows.logic";

const DURATION_LABEL = /^(Worked for|You stopped after|Continued for) (.+)$/u;

/** "Worked for 48s" with the duration emphasized. */
export function TurnFoldLabel({ label }: { readonly label: string }) {
  const match = DURATION_LABEL.exec(label);
  if (!match) return label;
  return (
    <>
      {match[1]} <span className="font-medium text-foreground">{match[2]}</span>
    </>
  );
}

function SummaryChip({ children }: { readonly children: ReactNode }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 text-xs text-muted-foreground tabular-nums [&_svg]:size-3">
      {children}
    </span>
  );
}

/** Step and file counts for a folded turn's header. */
export function WorkSummaryChips({ summary }: { readonly summary: WorkSummary }) {
  if (summary.steps === 0) return null;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <SummaryChip>
        {summary.steps} {summary.steps === 1 ? "step" : "steps"}
      </SummaryChip>
      {summary.files > 0 ? (
        <SummaryChip>
          <SquarePenIcon aria-hidden />
          {summary.files} {summary.files === 1 ? "file" : "files"}
          <DiffStatLabel
            additions={summary.additions}
            deletions={summary.deletions}
            layout="inline"
          />
        </SummaryChip>
      ) : summary.reads > 0 ? (
        <SummaryChip>
          <FileTextIcon aria-hidden />
          {summary.reads} read
        </SummaryChip>
      ) : null}
    </span>
  );
}
