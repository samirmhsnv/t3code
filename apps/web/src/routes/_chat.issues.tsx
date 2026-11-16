import { createFileRoute } from "@tanstack/react-router";

import { IssuesPage, type IssuesSearch } from "../components/issues/IssuesPage";

export const Route = createFileRoute("/_chat/issues")({
  validateSearch: (raw: Record<string, unknown>): IssuesSearch => {
    // Deckbell ids are numbers, which the search parser hands back as numbers.
    const issue =
      typeof raw.issue === "string" || typeof raw.issue === "number"
        ? String(raw.issue).slice(0, 200)
        : "";
    return (raw.source === "linear" || raw.source === "deckbell") && issue !== ""
      ? { source: raw.source, issue }
      : {};
  },
  component: IssuesPage,
});
