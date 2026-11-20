import { createFileRoute } from "@tanstack/react-router";

import { ConnectorsSettings } from "../components/settings/ConnectorsSettings";

export const Route = createFileRoute("/_chat/settings/connectors")({
  component: ConnectorsSettings,
});
