import { Group, Loader, Paper, Text } from "@mantine/core";

export function ActivityStrip({
  label,
  compact = false,
}: {
  label: string | null;
  compact?: boolean;
}) {
  if (!label) return null;
  return (
    <Paper
      px={compact ? "sm" : "md"}
      py={6}
      radius={compact ? "md" : 0}
      bg="dark.7"
      withBorder
      style={compact ? undefined : { borderLeft: 0, borderRight: 0 }}
    >
      <Group gap="xs" wrap="nowrap">
        <Loader size="xs" color="blue" type="dots" />
        <Text size="xs" c="dimmed" lineClamp={1}>
          {label}
        </Text>
      </Group>
    </Paper>
  );
}
