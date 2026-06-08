import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  AppShell,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconBrain,
  IconPlayerStop,
  IconSend,
} from "@tabler/icons-react";
import {
  DEFAULT_CURSOR_MODEL,
  type AgentStatus,
  type QueueItem,
  type WireMessage,
} from "../../../shared/types.js";
import { ActivityStrip } from "../chat/ActivityStrip.js";
import { QueuePanel } from "../chat/QueuePanel.js";
import { ToolCallCard } from "../chat/ToolCallCard.js";
import type { ChatItem } from "../chat/types.js";
import { toolDetail } from "../chat/types.js";
import {
  cancelQueuedItem,
  cancelRun,
  fetchAgent,
  fetchAgentHistory,
  forceSendQueued,
  sendPrompt,
  type AgentDetail,
} from "../api.js";
import { chatItemsFromHistory } from "../chat/history.js";
import { MarkdownText } from "../chat/MarkdownText.js";
import { agentStatusColor, runStatusLabel } from "../status.js";
import { connectAgentStream } from "../stream.js";
import { useTelegramBackButton, useTelegramMainButton } from "../useTelegramApp.js";

export function AgentChatPage({ agentId, onBack }: { agentId: string; onBack: () => void }) {
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<AgentStatus | "finished" | "cancelled">("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [sending, setSending] = useState(false);
  const [thinkingActive, setThinkingActive] = useState(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const assistantBuf = useRef("");
  const toolSeq = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useTelegramBackButton(onBack);

  const refreshAgent = useCallback(() => {
    void fetchAgent(agentId)
      .then((a) => {
        setAgent(a);
        if (a.activeRunId) {
          setRunId(a.activeRunId);
          setStatus("running");
        }
      })
      .catch(() => setAgent(null));
  }, [agentId]);

  useEffect(() => {
    refreshAgent();
  }, [refreshAgent]);

  useEffect(() => {
    void fetchAgentHistory(agentId).then(({ events }) => {
      const historical = chatItemsFromHistory(events);
      if (historical.length > 0) setItems(historical);
    });
  }, [agentId]);

  const handleWireEvent = useCallback((event: WireMessage) => {
    if (event.type === "user_message") {
      setItems((prev) => {
        if (prev.some((x) => x.kind === "user" && x.text === event.text)) return prev;
        return [
          ...prev,
          {
            kind: "user",
            id: `u-${event.runId}`,
            text: event.text,
            queued: event.queued,
          },
        ];
      });
    }

    if (event.type === "assistant_delta") {
      setThinkingActive(false);
      setActiveToolName(null);
      assistantBuf.current += event.text;
      setItems((prev) => {
        const last = prev[prev.length - 1];
        if (last?.kind === "assistant" && last.streaming) {
          return [...prev.slice(0, -1), { ...last, text: assistantBuf.current }];
        }
        return [...prev, { kind: "assistant", id: "streaming", text: assistantBuf.current, streaming: true }];
      });
    }

    if (event.type === "assistant_complete") {
      assistantBuf.current = "";
      setThinkingActive(false);
      setActiveToolName(null);
      setItems((prev) =>
        prev
          .filter((x) => !(x.kind === "assistant" && x.streaming))
          .concat({ kind: "assistant", id: event.runId, text: event.text }),
      );
    }

    if (event.type === "tool_call") {
      const detail = toolDetail(event.args);
      if (event.status === "running") {
        toolSeq.current += 1;
        setActiveToolName(event.name);
        setItems((prev) => [
          ...prev,
          {
            kind: "tool",
            id: `tool-${event.runId}-${toolSeq.current}`,
            runId: event.runId,
            name: event.name,
            status: "running",
            detail,
          },
        ]);
      } else {
        setActiveToolName(null);
        setItems((prev) => {
          const idx = [...prev]
            .reverse()
            .findIndex(
              (x) =>
                x.kind === "tool" &&
                x.runId === event.runId &&
                x.name === event.name &&
                x.status === "running",
            );
          if (idx < 0) {
            return [
              ...prev,
              {
                kind: "tool",
                id: `tool-${event.runId}-done-${toolSeq.current}`,
                runId: event.runId,
                name: event.name,
                status: event.status,
                detail,
              },
            ];
          }
          const realIdx = prev.length - 1 - idx;
          return prev.map((x, i) =>
            i === realIdx && x.kind === "tool"
              ? { ...x, status: event.status, detail: detail ?? x.detail }
              : x,
          );
        });
      }
    }

    if (event.type === "thinking") {
      if (event.duration != null) {
        setThinkingActive(false);
        setItems((prev) => [
          ...prev,
          {
            kind: "thinking",
            id: `think-${event.runId}-${event.duration}`,
            label: `Thought for ${(event.duration / 1000).toFixed(1)}s`,
          },
        ]);
      } else {
        setThinkingActive(true);
      }
    }

    if (event.type === "run_status") {
      setStatus(event.status);
      if (event.status === "running") setRunId(event.runId);
      if (event.status === "cancelled") {
        setItems((prev) =>
          prev.map((x) =>
            x.kind === "assistant" && x.streaming ? { ...x, streaming: false, cancelled: true } : x,
          ),
        );
        assistantBuf.current = "";
        setThinkingActive(false);
        setActiveToolName(null);
      }
      if (event.status !== "running") {
        setRunId(null);
        setThinkingActive(false);
        setActiveToolName(null);
      }
    }

    if (event.type === "queue_update") {
      setQueue(event.items);
      const queuedTexts = new Set(event.items.map((i) => i.text));
      setItems((prev) =>
        prev.map((x) =>
          x.kind === "user" && x.queued && !queuedTexts.has(x.text) ? { ...x, queued: false } : x,
        ),
      );
    }

    if (event.type === "error") {
      setItems((prev) => [
        ...prev,
        { kind: "system", id: `err-${Date.now()}`, text: event.message },
      ]);
      notifications.show({ title: "Agent error", message: event.message, color: "red" });
    }
  }, []);

  useEffect(() => {
    const disconnect = connectAgentStream(agentId, handleWireEvent);
    return disconnect;
  }, [agentId, handleWireEvent]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, queue]);

  const isRunning = status === "running";
  const isStreaming = items.some((x) => x.kind === "assistant" && x.streaming);

  const activityLabel = useMemo(() => {
    if (!isRunning) return null;
    if (activeToolName) return `Using ${activeToolName}…`;
    if (thinkingActive) return "Thinking…";
    if (isStreaming) return "Writing response…";
    return "Working…";
  }, [isRunning, activeToolName, thinkingActive, isStreaming]);

  const onSend = useCallback(async () => {
    const prompt = text.trim();
    if (!prompt || sending) return;

    const userId = `u-${Date.now()}`;
    setText("");
    setItems((prev) => [...prev, { kind: "user", id: userId, text: prompt }]);
    assistantBuf.current = "";
    setSending(true);

    try {
      const res = await sendPrompt(agentId, prompt);
      if (res.queued) {
        setItems((prev) =>
          prev.map((x) => (x.id === userId && x.kind === "user" ? { ...x, queued: true } : x)),
        );
        notifications.show({
          title: "Added to queue",
          message: "Your prompt will run when the current task finishes.",
          color: "blue",
        });
      } else {
        setStatus("running");
        setRunId(res.runId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      notifications.show({ title: "Send failed", message, color: "red" });
    } finally {
      setSending(false);
    }
  }, [agentId, sending, text]);

  const onStop = useCallback(async () => {
    const id = runId ?? agent?.activeRunId;
    if (!id) return;
    try {
      await cancelRun(agentId, id);
      notifications.show({ title: "Stopping…", message: "Cancelling the current run.", color: "orange" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      notifications.show({ title: "Stop failed", message, color: "red" });
    }
  }, [agent?.activeRunId, agentId, runId]);

  const mainButtonText = isRunning ? "Stop generating" : "Send";
  const mainButtonVisible = isRunning || Boolean(text.trim());
  useTelegramMainButton(
    mainButtonVisible
      ? {
          text: mainButtonText,
          visible: true,
          enabled: isRunning || Boolean(text.trim()) && !sending,
          onClick: () => void (isRunning ? onStop() : onSend()),
        }
      : null,
  );

  function confirmForceSend(queueId: string) {
    modals.openConfirmModal({
      title: "Send this prompt now?",
      children: (
        <Text size="sm">
          This stops the current run and starts the queued prompt immediately.
        </Text>
      ),
      labels: { confirm: "Send now", cancel: "Keep waiting" },
      confirmProps: { color: "orange" },
      onConfirm: () => {
        void forceSendQueued(agentId, queueId)
          .then(() => {
            notifications.show({ title: "Sent", message: "Queued prompt is now running.", color: "teal" });
            refreshAgent();
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            notifications.show({ title: "Force send failed", message, color: "red" });
          });
      },
    });
  }

  function onCancelQueued(queueId: string) {
    void cancelQueuedItem(agentId, queueId).then(() => {
      notifications.show({ title: "Removed", message: "Prompt removed from queue.", color: "gray" });
    });
  }

  const composerPlaceholder = isRunning
    ? "Add to queue while the agent is working…"
    : "Prompt the agent…";

  return (
    <AppShell
      header={{ height: 56 }}
      footer={{ height: "auto" }}
      padding={0}
      styles={{
        main: { display: "flex", flexDirection: "column", height: "100dvh" },
        footer: {
          paddingBottom: "calc(var(--mantine-spacing-md) + env(safe-area-inset-bottom))",
        },
      }}
    >
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <ActionIcon
              size={44}
              variant="subtle"
              color="gray"
              onClick={onBack}
              aria-label="Back"
            >
              <IconArrowLeft size={20} />
            </ActionIcon>
            <div style={{ minWidth: 0 }}>
              <Title order={5} lineClamp={1}>
                {agent?.title ?? "Agent"}
              </Title>
              <Text c="dimmed" size="xs" lineClamp={1}>
                {agent ? DEFAULT_CURSOR_MODEL : "Loading…"}
              </Text>
            </div>
          </Group>
          <Badge
            color={agentStatusColor(isRunning ? "running" : (agent?.status ?? "idle"))}
            variant={isRunning ? "filled" : "light"}
          >
            {runStatusLabel(isRunning ? "running" : (agent?.status ?? status))}
          </Badge>
        </Group>
      </AppShell.Header>

      <AppShell.Main style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <ActivityStrip label={activityLabel} />
        <ScrollArea style={{ flex: 1 }} type="auto" offsetScrollbars>
          <Stack gap="sm" p="md" pb="xl">
            {items.length === 0 && !isRunning && (
              <Stack align="center" justify="center" py="xl" gap="xs">
                <Text c="dimmed" size="sm" ta="center">
                  Send a prompt to start the agent.
                </Text>
                <Text c="dimmed" size="xs" ta="center">
                  Tool use, thinking, and streaming appear here in real time.
                </Text>
              </Stack>
            )}
            {items.map((item) => (
              <ChatItemView key={item.id} item={item} />
            ))}
            <div ref={bottomRef} />
          </Stack>
        </ScrollArea>
      </AppShell.Main>

      <AppShell.Footer p="md" pt="xs" withBorder>
        <Stack gap="sm">
          {isRunning && (
            <Button
              fullWidth
              color="red"
              variant="filled"
              size="md"
              leftSection={<IconPlayerStop size={18} />}
              onClick={() => void onStop()}
            >
              Stop generating
            </Button>
          )}
          <QueuePanel items={queue} onForceSend={confirmForceSend} onCancel={onCancelQueued} />
          <Group align="flex-end" gap="sm" wrap="nowrap">
            <Textarea
              placeholder={composerPlaceholder}
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              autosize
              minRows={1}
              maxRows={6}
              style={{ flex: 1 }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
            />
            <ActionIcon
              size={44}
              radius="xl"
              variant="filled"
              color="teal"
              loading={sending}
              disabled={!text.trim()}
              onClick={() => void onSend()}
              aria-label={isRunning ? "Add to queue" : "Send"}
            >
              <IconSend size={20} />
            </ActionIcon>
          </Group>
        </Stack>
      </AppShell.Footer>
    </AppShell>
  );
}

function ChatItemView({ item }: { item: ChatItem }) {
  if (item.kind === "tool") return <ToolCallCard item={item} />;

  if (item.kind === "thinking") {
    return (
      <Group gap={6} px="xs" style={{ alignSelf: "flex-start" }}>
        <IconBrain size={14} style={{ opacity: 0.5 }} />
        <Text size="xs" c="dimmed" fs="italic">
          {item.label}
        </Text>
      </Group>
    );
  }

  if (item.kind === "system") {
    return (
      <Alert icon={<IconAlertCircle size={16} />} color="red" radius="md" p="xs">
        <Text size="sm">{item.text}</Text>
      </Alert>
    );
  }

  const isUser = item.kind === "user";

  return (
    <Box style={{ alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: "92%" }}>
      <Paper
        p="sm"
        radius="md"
        bg={isUser ? "teal.9" : "dark.6"}
        withBorder={!isUser}
        opacity={item.kind === "assistant" && item.cancelled ? 0.65 : 1}
      >
        {isUser && item.queued && (
          <Badge size="xs" variant="light" color="blue" mb={6}>
            Queued
          </Badge>
        )}
        {item.kind === "assistant" && !item.streaming ? (
          <MarkdownText text={item.text} />
        ) : (
          <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {item.text}
            {item.kind === "assistant" && item.streaming && (
              <Text span c="teal.4" inherit>
                ▍
              </Text>
            )}
          </Text>
        )}
        {item.kind === "assistant" && item.cancelled && (
          <Text span c="dimmed" size="xs" mt={4} display="block">
            (stopped)
          </Text>
        )}
      </Paper>
    </Box>
  );
}
