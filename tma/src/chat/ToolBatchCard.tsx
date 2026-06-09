import { useState } from "react";
import { Badge, Collapse, Group, Paper, Stack, Text, ThemeIcon, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconTool } from "@tabler/icons-react";
import { ToolCallCard } from "./ToolCallCard.js";
import type { ChatItem } from "./types.js";

export type ToolBatchEntry = { name: string; detail?: string; status: "running" | "completed" | "error" };

function lastLabel(tools: ToolBatchEntry[]): string {
  const last = tools[tools.length - 1];
  if (!last) return "";
  if (last.detail) {
    const short = last.detail.split("/").pop() ?? last.detail;
    return `${last.name} ${short}`;
  }
  return last.name;
}

export function ToolBatchCard({ tools }: { tools: ToolBatchEntry[] }) {
  const [open, setOpen] = useState(false);
  if (tools.length === 0) return null;

  const running = tools.some((t) => t.status === "running");
  const color = running ? "blue" : "teal";

  return (
    <Paper radius="md" withBorder bg="dark.7" style={{ maxWidth: "92%" }}>
      <UnstyledButton
        w="100%"
        p="xs"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Group gap="sm" wrap="nowrap" justify="space-between">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            <ThemeIcon size="sm" radius="md" variant="light" color={color}>
              <IconTool size={14} />
            </ThemeIcon>
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Group gap={6} wrap="nowrap">
                <Text size="sm" fw={500}>
                  {tools.length} tool call{tools.length === 1 ? "" : "s"}
                </Text>
                <Badge size="xs" variant="light" color={color}>
                  {running ? "Running" : "Done"}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed" lineClamp={1} ff="monospace">
                Latest: {lastLabel(tools)}
              </Text>
            </Stack>
          </Group>
          {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
        </Group>
      </UnstyledButton>
      <Collapse in={open}>
        <Stack gap={6} px="xs" pb="xs">
          {tools.map((tool, i) => (
            <ToolCallCard
              key={`${tool.name}-${i}`}
              item={{
                kind: "tool",
                id: `batch-${i}`,
                runId: "batch",
                name: tool.name,
                status: tool.status,
                detail: tool.detail,
              }}
            />
          ))}
        </Stack>
      </Collapse>
    </Paper>
  );
}

export function groupConsecutiveTools(items: ChatItem[]): Array<ChatItem | { kind: "tool_batch"; id: string; tools: ToolBatchEntry[] }> {
  const out: Array<ChatItem | { kind: "tool_batch"; id: string; tools: ToolBatchEntry[] }> = [];
  let batch: ToolBatchEntry[] = [];
  let batchStart = "";

  const flush = () => {
    if (batch.length === 0) return;
    out.push({ kind: "tool_batch", id: batchStart, tools: batch });
    batch = [];
    batchStart = "";
  };

  for (const item of items) {
    if (item.kind === "tool") {
      if (batch.length === 0) batchStart = item.id;
      batch.push({ name: item.name, detail: item.detail, status: item.status });
    } else {
      flush();
      out.push(item);
    }
  }
  flush();
  return out;
}
