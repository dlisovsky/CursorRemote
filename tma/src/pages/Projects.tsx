import { useCallback, useEffect, useState, type MouseEvent } from "react";
import {
  Accordion,
  Badge,
  Button,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { IconFolder, IconMessageChatbot, IconPlayerPlay, IconPlus, IconRobot } from "@tabler/icons-react";
import type { IdeSessionInfo } from "../../../shared/types.js";
import { createAgent, fetchProjects, resumeIdeSession, type ProjectWithAgents } from "../api.js";
import { mergeProjectChats, type ProjectChatRow } from "../projects/sessionList.js";
import { agentStatusColor, runStatusLabel } from "../status.js";
import { isTelegramWebApp } from "../useTelegramApp.js";

export function ProjectsPage({
  onOpenAgent,
  onOpenIdeSession,
}: {
  onOpenAgent: (id: string) => void;
  onOpenIdeSession: (projectId: string, session: IdeSessionInfo) => void;
}) {
  const inTelegram = isTelegramWebApp();
  const [projects, setProjects] = useState<ProjectWithAgents[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [resuming, setResuming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await fetchProjects());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function onResume(projectId: string, row: ProjectChatRow, e: MouseEvent) {
    e.stopPropagation();
    if (row.kind !== "ide" || !row.canResume) return;
    setResuming(row.id);
    try {
      const agent = await resumeIdeSession(projectId, row.session.id);
      await load();
      onOpenAgent(agent.id);
    } finally {
      setResuming(null);
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
    .filter((p) => p.agents.length > 0 || (p.ideSessions?.length ?? 0) > 0)
    .map((p) => p.id)
    .slice(0, inTelegram ? 1 : undefined);

  return (
    <Accordion
      multiple
      defaultValue={defaultOpen}
      variant="separated"
      radius="md"
      chevronPosition="right"
    >
      {projects.map((project) => {
        const chats = mergeProjectChats(project.agents, project.ideSessions ?? []);
        return (
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
                <Badge variant="light" color="gray">
                  {chats.length} chat{chats.length === 1 ? "" : "s"}
                </Badge>
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
                {chats.length === 0 ? (
                  <Text c="dimmed" size="sm" py="xs">
                    No chats yet — create an agent or start one in Cursor IDE.
                  </Text>
                ) : (
                  chats.map((row) => (
                    <Paper
                      key={`${row.kind}-${row.id}`}
                      component="button"
                      type="button"
                      p="sm"
                      radius="md"
                      withBorder
                      onClick={() =>
                        row.kind === "agent"
                          ? onOpenAgent(row.agent.id)
                          : onOpenIdeSession(project.id, row.session)
                      }
                      style={{
                        cursor: "pointer",
                        textAlign: "left",
                        background: "var(--mantine-color-body)",
                        border: "1px solid var(--mantine-color-default-border)",
                      }}
                    >
                      <Group justify="space-between" wrap="nowrap" align="flex-start">
                        <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0, flex: 1 }}>
                          <ThemeIcon
                            size="sm"
                            radius="md"
                            variant="light"
                            color={row.kind === "ide" ? "violet" : "gray"}
                          >
                            {row.kind === "ide" ? (
                              <IconMessageChatbot size={14} />
                            ) : (
                              <IconRobot size={14} />
                            )}
                          </ThemeIcon>
                          <Stack gap={2} style={{ minWidth: 0 }}>
                            <Text fw={500} size="sm" lineClamp={2}>
                              {row.title}
                            </Text>
                            {row.kind === "ide" && row.session.subtitle && (
                              <Text size="xs" c="dimmed" lineClamp={1}>
                                {row.session.subtitle}
                              </Text>
                            )}
                          </Stack>
                        </Group>
                        <Group gap={6} wrap="nowrap">
                          {row.kind === "ide" && row.canResume && (
                            <Button
                              size="compact-xs"
                              variant="light"
                              color="teal"
                              leftSection={<IconPlayerPlay size={12} />}
                              loading={resuming === row.id}
                              onClick={(e) => void onResume(project.id, row, e)}
                            >
                              Resume
                            </Button>
                          )}
                          {row.kind === "ide" ? (
                            <Badge variant="outline" color="violet" size="sm">
                              IDE
                            </Badge>
                          ) : (
                            <Badge color={agentStatusColor(row.agent.status)} variant="dot" size="sm">
                              {runStatusLabel(row.agent.status)}
                            </Badge>
                          )}
                        </Group>
                      </Group>
                    </Paper>
                  ))
                )}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
}
