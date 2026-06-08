import { ActionIcon, Badge, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { IconArrowUp, IconX } from "@tabler/icons-react";
import type { QueueItem } from "../../../shared/types.js";

export function QueuePanel({
  items,
  onForceSend,
  onCancel,
}: {
  items: QueueItem[];
  onForceSend: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <Stack gap={6}>
      <Group gap={6}>
        <Text size="xs" c="dimmed" fw={600}>
          Queue
        </Text>
        <Badge size="xs" variant="light" color="blue">
          {items.length}
        </Badge>
      </Group>
      {items.map((item) => (
        <Paper key={item.id} p="xs" radius="md" withBorder bg="dark.8">
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
            <div style={{ minWidth: 0, flex: 1 }}>
              <Badge size="xs" variant="outline" color="gray" mb={4}>
                #{item.position + 1}
              </Badge>
              <Text size="sm" lineClamp={3}>
                {item.text}
              </Text>
            </div>
            <Group gap={4} wrap="nowrap">
              <Button
                size="compact-xs"
                variant="light"
                color="orange"
                leftSection={<IconArrowUp size={12} />}
                onClick={() => onForceSend(item.id)}
              >
                Now
              </Button>
              <ActionIcon
                size="md"
                variant="subtle"
                color="gray"
                aria-label="Remove from queue"
                onClick={() => onCancel(item.id)}
              >
                <IconX size={14} />
              </ActionIcon>
            </Group>
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}
