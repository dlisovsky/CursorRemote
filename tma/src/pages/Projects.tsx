import { useCallback, useEffect, useRef, useState } from "react";
import {
  Accordion,
  Box,
  Button,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { IconFolder, IconMessageChatbot, IconPlus, IconRobot } from "@tabler/icons-react";
import type { ProjectChatRowSnapshot, ProjectSnapshot } from "../../../shared/types.js";
import { createAgent, fetchProjects } from "../api.js";
import { RefreshIconButton } from "../components/RefreshIconButton.js";
import { usePullToRefresh } from "../hooks/usePullToRefresh.js";
import { projectsToSnapshots } from "../projects/snapshot.js";
import { connectProjectsStream } from "../projectsStream.js";
import { agentStatusColor, runStatusLabel } from "../status.js";
import { isTelegramWebApp, isTelegramLayout } from "../useTelegramApp.js";

const IDE_ACTIVE_MS = 60_000;

function isIdeRecentlyActive(updatedAt: string): boolean {
  const t = Date.parse(updatedAt);
  return Number.isFinite(t) && Date.now() - t < IDE_ACTIVE_MS;
}

function activityLine(row: ProjectChatRowSnapshot): string | null {
  if (row.kind === "agent") {
    if (row.status === "running") return row.activity ?? "Working…";
    if (row.status === "error" || row.status === "stale") return runStatusLabel(row.status);
    return null;
  }
  return row.subtitle.trim() || null;
}

function showRunningPulse(row: ProjectChatRowSnapshot): boolean {
  if (row.kind === "agent") return row.status === "running";
  return isIdeRecentlyActive(row.updatedAt);
}

export function ProjectsPage({
  onOpenAgent,
  onOpenIdeSession,
}: {
  onOpenAgent: (id: string) => void;
  onOpenIdeSession: (
    projectId: string,
    sessionId: string,
    meta: { title: string; subtitle: string; canResume: boolean },
  ) => void;
}) {
  const inTelegram = isTelegramWebApp();
  const tgLayout = isTelegramLayout();
  const [projects, setProjects] = useState<ProjectSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchProjects();
      setProjects(projectsToSnapshots(data));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const disconnect = connectProjectsStream(setProjects, setWsConnected);
    return disconnect;
  }, []);

  const pullEnabled = inTelegram || tgLayout;
  const { pullDistance, refreshing: pullRefreshing } = usePullToRefresh(
    load,
    pullEnabled,
    scrollRef,
  );

  async function onCreate(projectId: string) {
    setCreating(projectId);
    try {
      const agent = await createAgent(projectId);
      await load();
      onOpenAgent(agent.id);
    } finally {
      setCreating(null);
    }
  }

  if (loading) {
    return (
      <Stack gap="sm">
        <Skeleton height={72} radius="md" />
        <Skeleton height={72} radius="md" />
      </Stack>
    );
  }

  if (projects.length === 0) {
    return (
      <Paper p="lg" radius="md" withBorder>
        <Stack align="center" gap="sm">
          <ThemeIcon size={48} radius="xl" variant="light" color="gray">
            <IconFolder size={24} />
          </ThemeIcon>
          <Text fw={600}>No projects configured</Text>
          <Text c="dimmed" size="sm" ta="center">
            Add repo paths to <code>PROJECT_PATHS</code> in your <code>.env</code> file.
          </Text>
        </Stack>
      </Paper>
    );
  }

  const defaultOpen = projects
    .filter((p) => p.chats.length > 0)
    .map((p) => p.id)
    .slice(0, inTelegram ? 1 : undefined);

  const isRefreshing = refreshing || pullRefreshing;

  return (
    <Box style={{ position: "relative" }}>
      <Group justify="flex-end" mb="xs">
        {!wsConnected && (
          <Text size="xs" c="dimmed" style={{ flex: 1 }}>
            Reconnecting…
          </Text>
        )}
        <RefreshIconButton onRefresh={() => void load()} loading={isRefreshing} />
      </Group>
      {pullDistance > 0 && (
        <Text size="xs" c="dimmed" ta="center" mb="xs">
          {pullDistance >= 72 ? "Release to refresh" : "Pull to refresh"}
        </Text>
      )}
      <Box ref={scrollRef} style={{ maxHeight: "calc(100dvh - 120px)", overflow: "auto" }}>
        <Accordion
          multiple
          defaultValue={defaultOpen}
          variant="separated"
          radius="md"
          chevronPosition="right"
        >
          {projects.map((project) => (
            <Accordion.Item key={project.id} value={project.id}>
              <Accordion.Control>
                <Group justify="space-between" wrap="nowrap" pr="xs">
                  <Group gap="sm" wrap="nowrap">
                    <ThemeIcon size="md" radius="md" variant="default" color="gray">
                      <IconFolder size={16} />
                    </ThemeIcon>
                    <Text fw={600} size="sm" lineClamp={1}>
                      {project.name}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {project.chats.length} chat{project.chats.length === 1 ? "" : "s"}
                  </Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  <Button
                    leftSection={<IconPlus size={16} />}
                    variant="light"
                    color="teal"
                    loading={creating === project.id}
                    onClick={() => void onCreate(project.id)}
                  >
                    New agent
                  </Button>
                  {project.chats.length === 0 ? (
                    <Text c="dimmed" size="sm" py="xs">
                      No chats yet — create an agent or start one in Cursor IDE.
                    </Text>
                  ) : (
                    project.chats.map((row) => (
                      <ChatRow
                        key={`${row.kind}-${row.id}`}
                        row={row}
                        onClick={() => {
                          if (row.kind === "agent") {
                            onOpenAgent(row.id);
                            return;
                          }
                          onOpenIdeSession(project.id, row.id, {
                            title: row.title,
                            subtitle: row.subtitle,
                            canResume: row.canResume,
                          });
                        }}
                      />
                    ))
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </Box>
    </Box>
  );
}

function ChatRow({ row, onClick }: { row: ProjectChatRowSnapshot; onClick: () => void }) {
  const pulse = showRunningPulse(row);
  const activity = activityLine(row);
  const showStatusDot = row.kind === "agent" && (row.status === "error" || row.status === "stale");

  return (
    <Paper
      component="button"
      type="button"
      p="sm"
      radius="md"
      withBorder
      onClick={onClick}
      style={{
        cursor: "pointer",
        textAlign: "left",
        background: "var(--mantine-color-body)",
        border: "1px solid var(--mantine-color-default-border)",
      }}
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon
          size="sm"
          radius="md"
          variant="light"
          color={row.kind === "ide" ? "violet" : "gray"}
        >
          {row.kind === "ide" ? <IconMessageChatbot size={14} /> : <IconRobot size={14} />}
        </ThemeIcon>
        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
          <Group gap={6} wrap="nowrap" align="center">
            {pulse && <span className="status-pulse-dot" />}
            {showStatusDot && (
              <Box
                w={8}
                h={8}
                style={{
                  borderRadius: "50%",
                  background: `var(--mantine-color-${agentStatusColor(row.status)}-filled)`,
                  flexShrink: 0,
                }}
              />
            )}
            <Text fw={500} size="sm" lineClamp={2} style={{ flex: 1 }}>
              {row.title}
            </Text>
          </Group>
          {activity && (
            <Text size="xs" c="dimmed" lineClamp={1}>
              {activity}
            </Text>
          )}
        </Stack>
      </Group>
    </Paper>
  );
}
