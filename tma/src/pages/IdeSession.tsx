import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  AppShell,
  Badge,
  Button,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowLeft, IconMessageChatbot, IconPlayerPlay } from "@tabler/icons-react";
import type { IdeTranscriptLine } from "../../../shared/types.js";
import { fetchIdeSession, resumeIdeSession } from "../api.js";
import { MarkdownText } from "../chat/MarkdownText.js";
import { ToolBatchCard } from "../chat/ToolBatchCard.js";
import { isTelegramLayout, useTelegramBackButton } from "../useTelegramApp.js";

export function IdeSessionPage({
  projectId,
  sessionId,
  title: initialTitle,
  subtitle: initialSubtitle,
  canResume,
  onBack,
  onResumed,
}: {
  projectId: string;
  sessionId: string;
  title: string;
  subtitle: string;
  canResume: boolean;
  onBack: () => void;
  onResumed: (agentId: string) => void;
}) {
  const tgLayout = isTelegramLayout();
  const [title, setTitle] = useState(initialTitle);
  const [subtitle, setSubtitle] = useState(initialSubtitle);
  const [lines, setLines] = useState<IdeTranscriptLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useTelegramBackButton(onBack);

  useEffect(() => {
    setLoading(true);
    fetchIdeSession(projectId, sessionId)
      .then((data) => {
        setTitle(data.title);
        setSubtitle(data.subtitle);
        setLines(data.lines);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [projectId, sessionId]);

  useEffect(() => {
    if (loading || lines.length === 0) return;
    requestAnimationFrame(() => {
      const el = viewportRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
    });
  }, [loading, lines]);

  async function onResume() {
    if (!canResume) return;
    setResuming(true);
    try {
      const agent = await resumeIdeSession(projectId, sessionId);
      onResumed(agent.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResuming(false);
    }
  }

  return (
    <AppShell header={{ height: tgLayout ? 52 : 56 }} padding={0}>
      <AppShell.Header
        px="md"
        style={{
          borderBottom: "1px solid var(--mantine-color-default-border)",
          paddingTop: tgLayout ? "var(--tg-safe-top)" : undefined,
        }}
      >
        <Group h="100%" wrap="nowrap" gap="sm">
          {!tgLayout && (
            <ActionIcon variant="subtle" color="gray" onClick={onBack} aria-label="Back">
              <IconArrowLeft size={18} />
            </ActionIcon>
          )}
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
            <Title order={5} lineClamp={1}>
              {title}
            </Title>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {subtitle || (canResume ? "Cursor IDE · view or resume" : "Cursor IDE · view only")}
            </Text>
          </Stack>
          {canResume ? (
            <Button
              size="compact-sm"
              variant="light"
              color="teal"
              leftSection={<IconPlayerPlay size={14} />}
              loading={resuming}
              onClick={() => void onResume()}
            >
              Resume
            </Button>
          ) : (
            <Badge variant="light" color="violet" leftSection={<IconMessageChatbot size={12} />}>
              IDE
            </Badge>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Main
        pb={tgLayout ? "var(--tg-safe-bottom)" : "md"}
        style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        <ScrollArea style={{ flex: 1 }} px="md" py="sm" type="auto" viewportRef={viewportRef}>
          {loading && (
            <Text c="dimmed" size="sm">
              Loading transcript…
            </Text>
          )}
          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}
          {!loading && !error && lines.length === 0 && (
            <Text c="dimmed" size="sm">
              Empty transcript.
            </Text>
          )}
          <Stack gap="sm" pb="md">
            {lines.map((line, i) => (
              <TranscriptRow key={`${line.role}-${i}`} line={line} />
            ))}
          </Stack>
        </ScrollArea>
      </AppShell.Main>
    </AppShell>
  );
}

function TranscriptRow({ line }: { line: IdeTranscriptLine }) {
  if (line.role === "user") {
    return (
      <Paper p="sm" radius="md" bg="teal.9" ml="auto" maw="92%">
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
          {line.text}
        </Text>
      </Paper>
    );
  }

  const tools =
    line.tools?.map((t) => ({
      name: t.name,
      detail: t.summary,
      status: "completed" as const,
    })) ?? [];

  return (
    <Stack gap="xs" maw="100%">
      {line.text ? (
        <Paper p="sm" radius="md" bg="dark.6">
          <MarkdownText text={line.text} />
        </Paper>
      ) : null}
      {tools.length > 0 ? <ToolBatchCard tools={tools} /> : null}
    </Stack>
  );
}
