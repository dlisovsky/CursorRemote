/**
 * Create a local SDK agent and print its ID (for sdk:list discovery tests).
 */
import "dotenv/config";
import path from "node:path";
import { Agent } from "@cursor/sdk";
import { DEFAULT_CURSOR_MODEL } from "../shared/types.js";

const apiKey = process.env.CURSOR_API_KEY!.trim();
const cwd = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("/Users/dmitry.lisovsky/dev/gopadel");
const model = { id: process.env.CURSOR_MODEL?.trim() || DEFAULT_CURSOR_MODEL };

const agent = await Agent.create({ apiKey, model, local: { cwd } });
console.log("created", { agentId: agent.agentId, cwd });

const run = await agent.send("Reply with exactly: sdk-list-probe-ok");
for await (const _ of run.stream()) {
  /* drain */
}
const result = await run.wait();
console.log("run", { runId: run.id, status: result.status });
agent.close();
