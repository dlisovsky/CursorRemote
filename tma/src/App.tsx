import { useEffect, useState } from "react";
import { Alert, Center, Container, Loader, Stack, Text, Title } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { login } from "./api.js";
import { ProjectsPage } from "./pages/Projects.js";
import { AgentChatPage } from "./pages/AgentChat.js";
import { isTelegramWebApp, useTelegramApp } from "./useTelegramApp.js";

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);

  useTelegramApp();

  useEffect(() => {
    login()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <Container py="xl" size="sm">
        <Alert icon={<IconAlertCircle size={16} />} title="Authentication failed" color="red">
          {error}
        </Alert>
      </Container>
    );
  }

  if (!ready) {
    return (
      <Center h="100dvh">
        <Stack align="center" gap="sm">
          <Loader color="teal" type="dots" />
          <Text c="dimmed" size="sm">
            Connecting…
          </Text>
        </Stack>
      </Center>
    );
  }

  if (agentId) {
    return <AgentChatPage agentId={agentId} onBack={() => setAgentId(null)} />;
  }

  const inTelegram = isTelegramWebApp();

  return (
    <Container
      py="md"
      px="md"
      size="sm"
      pt={inTelegram ? "calc(var(--mantine-spacing-md) + var(--tg-safe-top))" : "md"}
      pb="calc(var(--mantine-spacing-md) + var(--tg-safe-bottom))"
    >
      <Stack gap="lg">
        <Title order={inTelegram ? 4 : 3} fw={500}>
          Your projects
        </Title>
        <ProjectsPage onOpenAgent={setAgentId} />
      </Stack>
    </Container>
  );
}
