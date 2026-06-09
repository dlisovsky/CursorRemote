import { Badge, Group, Loader, Paper, Text, ThemeIcon } from "@mantine/core";
import { IconCheck, IconTool, IconX } from "@tabler/icons-react";
import { runStatusLabel } from "../status.js";
import type { ChatItem } from "./types.js";

export function ToolCallCard({ item }: { item: Extract<ChatItem, { kind: "tool" }> }) {
  const icon =
    item.status === "running" ? (
      <Loader size={12} color="blue" type="oval" />
    ) : item.status === "error" ? (
      <IconX size={14} />
    ) : (
      <IconCheck size={14} />
    );

  const color = item.status === "running" ? "blue" : item.status === "error" ? "red" : "teal";

  return (
    <Paper p="xs" radius="md" withBorder bg="dark.7" style={{ maxWidth: "92%" }}>
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon size="sm" radius="md" variant="light" color={color}>
          {icon}
        </ThemeIcon>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Group gap={6} wrap="nowrap">
            <IconTool size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
            <Text size="sm" fw={500} lineClamp={1}>
              {item.name}
            </Text>
            <Badge size="xs" variant="light" color={color}>
              {runStatusLabel(item.status)}
            </Badge>
          </Group>
          {item.detail && (
            <Text size="xs" c="dimmed" lineClamp={2} mt={4} ff="monospace">
              {item.detail}
            </Text>
          )}
        </div>
      </Group>
    </Paper>
  );
}
