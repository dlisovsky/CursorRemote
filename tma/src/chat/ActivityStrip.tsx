import { Group, Loader, Paper, Text } from "@mantine/core";

export function ActivityStrip({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <Paper px="md" py={6} radius={0} bg="dark.7" withBorder style={{ borderLeft: 0, borderRight: 0 }}>
      <Group gap="xs" wrap="nowrap">
        <Loader size="xs" color="blue" type="dots" />
        <Text size="xs" c="dimmed" lineClamp={1}>
          {label}
        </Text>
      </Group>
    </Paper>
  );
}
