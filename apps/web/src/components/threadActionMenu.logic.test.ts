import { describe, expect, it } from "vite-plus/test";

import { EnvironmentId, ProjectId } from "@t3tools/contracts";

import {
  buildThreadActionMenuItems,
  moveTargetProjectId,
  threadMoveTargets,
  type ThreadActionMenuState,
} from "./threadActionMenu.logic";

const baseState: ThreadActionMenuState = {
  canOperate: true,
  branch: null,
  projectFilter: null,
  isPinned: false,
  isSettled: false,
  autoSettleEnabled: true,
  isSnoozed: false,
  canSnoozeNow: true,
  isRegeneratingTitle: false,
  isRunning: false,
  supports: {
    settlement: true,
    autoSettleOptOut: true,
    snooze: true,
    pinning: true,
    titleRegeneration: true,
  },
  snoozePresets: [
    { id: "hour", label: "In 1 hour", whenLabel: "3:00 PM", snoozedUntil: "2026-08-07T15:00:00Z" },
  ],
};

describe("buildThreadActionMenuItems", () => {
  it.each([false, true])(
    "disables both lifecycle directions without permission (reversed: %s)",
    (reversed) => {
      const items = buildThreadActionMenuItems({
        ...baseState,
        canOperate: false,
        isPinned: reversed,
        isSettled: reversed,
        isSnoozed: reversed,
      });
      const expected = reversed
        ? [
            "unpin",
            "unsettle",
            "unsnooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ]
        : [
            "pin",
            "settle",
            "snooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ];
      expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual(expected);
      expect(
        items.find((item) => item.id === "snooze")?.children?.every((child) => child.disabled) ??
          true,
      ).toBe(true);
    },
  );

  it("disables archive while the thread is running", () => {
    const archiveItem = buildThreadActionMenuItems({ ...baseState, isRunning: true }).find(
      (item) => item.id === "archive",
    );
    expect(archiveItem?.disabled).toBe(true);
  });
});

describe("thread move targets", () => {
  it("offers other projects in the same environment and maps the pick back", () => {
    const local = EnvironmentId.make("env:local");
    const remote = EnvironmentId.make("env:remote");
    const project = (environmentId: EnvironmentId, id: string, title: string) => ({
      environmentId,
      id: ProjectId.make(id),
      title,
    });
    const targets = threadMoveTargets(
      [
        project(local, "project:current", "Current"),
        project(local, "project:web", "web"),
        project(remote, "project:remote", "Remote"),
        project(local, "project:api", "api"),
      ],
      { environmentId: local, projectId: ProjectId.make("project:current") },
    );
    expect(targets.map((target) => target.title)).toEqual(["api", "web"]);

    const items = buildThreadActionMenuItems({ ...baseState, moveTargets: targets });
    const move = items.find((item) => item.id === "move-to-project");
    const picked = move?.children?.[1]?.id;
    expect(picked && moveTargetProjectId(picked)).toBe("project:web");
    expect(moveTargetProjectId("rename")).toBeNull();

    const running = buildThreadActionMenuItems({
      ...baseState,
      moveTargets: targets,
      isRunning: true,
    });
    expect(running.find((item) => item.id === "move-to-project")?.disabled).toBe(true);
  });
});
