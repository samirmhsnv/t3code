import { createFileRoute } from "@tanstack/react-router";

import { UsagePage } from "../components/usage/UsagePage";

export const Route = createFileRoute("/_chat/usage")({
  // Links can open a tab without changing the remembered one.
  validateSearch: (raw: Record<string, unknown>): { readonly metric?: "limits" } =>
    raw.metric === "limits" ? { metric: "limits" } : {},
  component: UsagePage,
});
