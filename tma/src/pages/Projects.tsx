import { useCallback, useEffect, useState } from "react";
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
import { IconFolder, IconPlus, IconRobot } from "@tabler/icons-react";
import { createAgent, fetchProjects, type ProjectWithAgents } from "../api.js";
import { agentStatusColor } from "../status.js";

export function ProjectsPage({ onOpenAgent }: { onOpenAgent: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectWithAgents[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);

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

  return (
    <Accordion
      multiple
      defaultValue={projects.map((p) => p.id)}
      variant="separated"
      radius="md"
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
              <Badge variant="light" color="gray">
                {project.agents.length} agent{project.agents.length === 1 ? "" : "s"}
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
              {project.agents.length === 0 ? (
                <Text c="dimmed" size="sm" py="xs">
                  No agents yet — create one to start chatting.
                </Text>
              ) : (
                project.agents.map((agent) => (
                  <Paper
                    key={agent.id}
                    component="button"
                    type="button"
                    p="sm"
                    radius="md"
                    withBorder
                    onClick={() => onOpenAgent(agent.id)}
                    style={{
                      cursor: "pointer",
                      textAlign: "left",
                      background: "var(--mantine-color-body)",
                      border: "1px solid var(--mantine-color-default-border)",
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm" wrap="nowrap">
                        <ThemeIcon size="sm" radius="md" variant="default" color="gray">
                          <IconRobot size={14} />
                        </ThemeIcon>
                        <Text fw={500} size="sm" lineClamp={1}>
                          {agent.title}
                        </Text>
                      </Group>
                      <Badge color={agentStatusColor(agent.status)} variant="dot" size="sm">
                        {agent.status}
                      </Badge>
                    </Group>
                  </Paper>
                ))
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}
