/**
 * Probe Agent.list() for each PROJECT_PATHS cwd — see if IDE Composer sessions appear.
 *
 * Usage: npm run sdk:list
 */
import "dotenv/config";
import path from "node:path";
import { Agent, getDefaultSdkStateRoot } from "@cursor/sdk";

const apiKey = process.env.CURSOR_API_KEY?.trim();
if (!apiKey) {
  console.error("Missing CURSOR_API_KEY");
  process.exit(1);
}

function projectPaths(): string[] {
  const raw = process.env.PROJECT_PATHS?.trim();
  if (!raw) return [process.cwd()];
  return raw.split(",").map((p) => path.resolve(p.trim())).filter(Boolean);
}

async function listLocal(cwd: string) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`LOCAL  cwd=${cwd}`);
  console.log("=".repeat(72));

  const agents = await Agent.list({ runtime: "local", cwd });
  console.log(`Found ${agents.items.length} agent(s)${agents.nextCursor ? " (paginated)" : ""}`);

  for (const info of agents.items) {
    console.log("\n--- agent ---");
    console.log(JSON.stringify(info, null, 2));

    try {
      const runs = await Agent.listRuns(info.agentId, { runtime: "local", cwd });
      console.log(`  runs: ${runs.items.length}`);
      for (const run of runs.items.slice(0, 3)) {
        console.log(
          `    - ${run.id} status=${run.status} model=${run.model?.id ?? "?"}`,
        );
      }
      if (runs.items.length > 3) console.log(`    ... +${runs.items.length - 3} more`);

      const messages = await Agent.messages.list(info.agentId, {
        runtime: "local",
        cwd,
        limit: 3,
      });
      console.log(`  messages (first ${messages.length}):`);
      for (const m of messages) {
        const preview =
          m.type === "user" || m.type === "assistant"
            ? JSON.stringify(m.message).slice(0, 120)
            : String(m.type);
        console.log(`    [${m.type}] ${preview}`);
      }
    } catch (err) {
      console.log(`  detail error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function listCloud() {
  console.log(`\n${"=".repeat(72)}`);
  console.log("CLOUD agents");
  console.log("=".repeat(72));

  try {
    const agents = await Agent.list({ runtime: "cloud", apiKey, limit: 20 });
    console.log(`Found ${agents.items.length} cloud agent(s)`);
    for (const info of agents.items) {
      console.log("\n--- cloud agent ---");
      console.log(JSON.stringify(info, null, 2));
    }
  } catch (err) {
    console.log(`Cloud list failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  const cwds = [...new Set(projectPaths())];
  console.log("API key prefix:", apiKey!.slice(0, 12) + "...");
  console.log("Scanning cwds:", cwds);
  for (const cwd of cwds) {
    console.log(`  state root for ${cwd}:`, getDefaultSdkStateRoot(cwd));
  }

  for (const cwd of cwds) {
    await listLocal(cwd);
  }

  await listCloud();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
