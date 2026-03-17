import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { createClient } from "@base44/sdk";

// ─── Configuration ────────────────────────────────────────────────────────────

const APP_ID = process.env.BASE44_APP_ID || "";
const EMAIL = process.env.BASE44_EMAIL || "";
const PASSWORD = process.env.BASE44_PASSWORD || "";
const PORT = parseInt(process.env.PORT || "3000");

if (!APP_ID) {
  console.error("ERROR: BASE44_APP_ID environment variable is required");
  process.exit(1);
}

// ─── Base44 Client ────────────────────────────────────────────────────────────

let base44: ReturnType<typeof createClient>;
let authenticated = false;

async function getClient(): Promise<ReturnType<typeof createClient>> {
  if (!base44) {
    base44 = createClient({ appId: APP_ID });
  }
  if (!authenticated && EMAIL && PASSWORD) {
    try {
      await base44.auth.loginViaEmailPassword(EMAIL, PASSWORD);
      authenticated = true;
    } catch (err) {
      console.error("Base44 auth warning:", err);
    }
  }
  return base44;
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "base44-mcp-server",
  version: "1.0.0",
});

// ─── Tools: Entity Operations ─────────────────────────────────────────────────

server.registerTool(
  "base44_entity_list",
  {
    title: "List Entity Records",
    description: `List all records from a Base44 app entity (database table).
Returns paginated records, sorted by the specified field.

Args:
  - entity_name (string): Name of the entity/table (e.g., "Task", "User", "Order")
  - sort_by (string, optional): Field to sort by. Prefix with '-' for descending (e.g., "-created_date")
  - limit (number, optional): Max records to return (default: 50, max: 200)
  - skip (number, optional): Number of records to skip for pagination (default: 0)
  - fields (string[], optional): Specific fields to return (returns all if omitted)

Returns: JSON array of records with all or selected fields.

Examples:
  - List all tasks: entity_name="Task"
  - Latest 10 orders: entity_name="Order", sort_by="-created_date", limit=10
  - Paginate: entity_name="Product", limit=20, skip=40`,
    inputSchema: z.object({
      entity_name: z.string().describe("Name of the Base44 entity (e.g. Task, User, Order)"),
      sort_by: z.string().optional().describe("Sort field, prefix with '-' for descending (e.g. '-created_date')"),
      limit: z.number().int().min(1).max(200).default(50).describe("Max records to return"),
      skip: z.number().int().min(0).default(0).describe("Records to skip for pagination"),
      fields: z.array(z.string()).optional().describe("Specific fields to return"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ entity_name, sort_by, limit, skip, fields }) => {
    try {
      const client = await getClient();
      const entityRef = (client.entities as Record<string, any>)[entity_name];
      if (!entityRef) {
        return { content: [{ type: "text", text: `Error: Entity '${entity_name}' not found. Check the entity name.` }] };
      }
      const records = await entityRef.list(sort_by, limit, skip, fields);
      return { content: [{ type: "text", text: JSON.stringify({ entity: entity_name, count: records.length, skip, records }, null, 2) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "base44_entity_get",
  {
    title: "Get Entity Record by ID",
    description: `Retrieve a single Base44 entity record by its ID.

Args:
  - entity_name (string): Name of the entity (e.g., "Task", "User")
  - id (string): Record ID to retrieve

Returns: Single record object with all fields, or an error if not found.`,
    inputSchema: z.object({
      entity_name: z.string().describe("Name of the Base44 entity"),
      id: z.string().describe("Record ID to retrieve"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ entity_name, id }) => {
    try {
      const client = await getClient();
      const entityRef = (client.entities as Record<string, any>)[entity_name];
      if (!entityRef) {
        return { content: [{ type: "text", text: `Error: Entity '${entity_name}' not found.` }] };
      }
      const record = await entityRef.get(id);
      return { content: [{ type: "text", text: JSON.stringify(record, null, 2) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "base44_entity_filter",
  {
    title: "Filter Entity Records",
    description: `Filter Base44 entity records by field values.

Args:
  - entity_name (string): Name of the entity (e.g., "Task", "Order")
  - filters (object): Key-value pairs to filter by (e.g., {"status": "pending", "priority": "high"})
  - sort_by (string, optional): Sort field, prefix '-' for descending
  - limit (number, optional): Max records to return (default: 50)
  - skip (number, optional): Records to skip (default: 0)

Returns: JSON array of matching records.

Examples:
  - Pending tasks: entity_name="Task", filters={"status":"pending"}
  - High priority open items: filters={"status":"open","priority":"high"}`,
    inputSchema: z.object({
      entity_name: z.string().describe("Name of the Base44 entity"),
      filters: z.record(z.unknown()).describe("Key-value filter criteria"),
      sort_by: z.string().optional().describe("Sort field (prefix '-' for descending)"),
      limit: z.number().int().min(1).max(200).default(50).describe("Max records"),
      skip: z.number().int().min(0).default(0).describe("Records to skip"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ entity_name, filters, sort_by, limit, skip }) => {
    try {
      const client = await getClient();
      const entityRef = (client.entities as Record<string, any>)[entity_name];
      if (!entityRef) {
        return { content: [{ type: "text", text: `Error: Entity '${entity_name}' not found.` }] };
      }
      const records = await entityRef.filter(filters, sort_by, limit, skip);
      return { content: [{ type: "text", text: JSON.stringify({ entity: entity_name, filters, count: records.length, records }, null, 2) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "base44_entity_create",
  {
    title: "Create Entity Record",
    description: `Create a new record in a Base44 entity.

Args:
  - entity_name (string): Name of the entity (e.g., "Task", "Product")
  - data (object): Field values for the new record

Returns: The created record with its assigned ID and all fields.

Example:
  - entity_name="Task", data={"title":"My task","status":"pending","dueDate":"2025-12-31"}`,
    inputSchema: z.object({
      entity_name: z.string().describe("Name of the Base44 entity"),
      data: z.record(z.unknown()).describe("Field values for the new record"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ entity_name, data }) => {
    try {
      const client = await getClient();
      const entityRef = (client.entities as Record<string, any>)[entity_name];
      if (!entityRef) {
        return { content: [{ type: "text", text: `Error: Entity '${entity_name}' not found.` }] };
      }
      const record = await entityRef.create(data);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, entity: entity_name, record }, null, 2) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "base44_entity_update",
  {
    title: "Update Entity Record",
    description: `Update an existing Base44 entity record by ID.

Args:
  - entity_name (string): Name of the entity
  - id (string): Record ID to update
  - data (object): Fields to update (only specified fields are changed)

Returns: The updated record with all current fields.

Example:
  - entity_name="Task", id="abc123", data={"status":"completed"}`,
    inputSchema: z.object({
      entity_name: z.string().describe("Name of the Base44 entity"),
      id: z.string().describe("Record ID to update"),
      data: z.record(z.unknown()).describe("Fields to update"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ entity_name, id, data }) => {
    try {
      const client = await getClient();
      const entityRef = (client.entities as Record<string, any>)[entity_name];
      if (!entityRef) {
        return { content: [{ type: "text", text: `Error: Entity '${entity_name}' not found.` }] };
      }
      const record = await entityRef.update(id, data);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, entity: entity_name, id, record }, null, 2) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "base44_entity_delete",
  {
    title: "Delete Entity Record",
    description: `Delete a single Base44 entity record by ID.

Args:
  - entity_name (string): Name of the entity
  - id (string): Record ID to delete

Returns: Confirmation of deletion.

WARNING: This operation is irreversible.`,
    inputSchema: z.object({
      entity_name: z.string().describe("Name of the Base44 entity"),
      id: z.string().describe("Record ID to delete"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  async ({ entity_name, id }) => {
    try {
      const client = await getClient();
      const entityRef = (client.entities as Record<string, any>)[entity_name];
      if (!entityRef) {
        return { content: [{ type: "text", text: `Error: Entity '${entity_name}' not found.` }] };
      }
      await entityRef.delete(id);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, entity: entity_name, deleted_id: id }) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "base44_entity_delete_many",
  {
    title: "Delete Multiple Entity Records",
    description: `Delete multiple Base44 entity records matching filter criteria.

Args:
  - entity_name (string): Name of the entity
  - filters (object): Key-value filter criteria - all matching records will be deleted

Returns: Confirmation with count of deleted records.

WARNING: This operation is irreversible. Use base44_entity_filter first to preview which records will be deleted.`,
    inputSchema: z.object({
      entity_name: z.string().describe("Name of the Base44 entity"),
      filters: z.record(z.unknown()).describe("Filter criteria - matching records will be deleted"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  async ({ entity_name, filters }) => {
    try {
      const client = await getClient();
      const entityRef = (client.entities as Record<string, any>)[entity_name];
      if (!entityRef) {
        return { content: [{ type: "text", text: `Error: Entity '${entity_name}' not found.` }] };
      }
      const result = await entityRef.deleteMany(filters);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, entity: entity_name, filters, result }, null, 2) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "base44_entity_bulk_create",
  {
    title: "Bulk Create Entity Records",
    description: `Create multiple Base44 entity records in a single request.

Args:
  - entity_name (string): Name of the entity
  - records (array): Array of record objects to create

Returns: Array of created records with assigned IDs.

Example:
  - entity_name="Task", records=[{"title":"Task 1","status":"pending"},{"title":"Task 2","status":"pending"}]`,
    inputSchema: z.object({
      entity_name: z.string().describe("Name of the Base44 entity"),
      records: z.array(z.record(z.unknown())).min(1).describe("Array of records to create"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ entity_name, records }) => {
    try {
      const client = await getClient();
      const entityRef = (client.entities as Record<string, any>)[entity_name];
      if (!entityRef) {
        return { content: [{ type: "text", text: `Error: Entity '${entity_name}' not found.` }] };
      }
      const created = await entityRef.bulkCreate(records);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, entity: entity_name, created_count: created.length, records: created }, null, 2) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

// ─── Tools: Auth ──────────────────────────────────────────────────────────────

server.registerTool(
  "base44_auth_me",
  {
    title: "Get Current User",
    description: `Get information about the currently authenticated Base44 user.

Returns: User object with id, email, name, role, and other profile fields.
Returns an error if not authenticated (requires BASE44_EMAIL and BASE44_PASSWORD env vars).`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    try {
      const client = await getClient();
      const user = await client.auth.me();
      return { content: [{ type: "text", text: JSON.stringify(user, null, 2) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "base44_auth_check",
  {
    title: "Check Authentication Status",
    description: `Check if the current Base44 session is authenticated.

Returns: JSON with isAuthenticated boolean and the app ID being accessed.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    try {
      const client = await getClient();
      const isAuthenticated = await client.auth.isAuthenticated();
      return { content: [{ type: "text", text: JSON.stringify({ isAuthenticated, appId: APP_ID }) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

// ─── Tools: Backend Functions ─────────────────────────────────────────────────

server.registerTool(
  "base44_function_invoke",
  {
    title: "Invoke Backend Function",
    description: `Invoke a custom backend function defined in your Base44 app.

Args:
  - function_name (string): Name of the backend function to invoke
  - params (object, optional): Parameters to pass to the function

Returns: The function's return value as JSON.

Example:
  - function_name="processOrder", params={"orderId":"123","action":"fulfill"}`,
    inputSchema: z.object({
      function_name: z.string().describe("Name of the Base44 backend function"),
      params: z.record(z.unknown()).optional().default({}).describe("Parameters to pass to the function"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ function_name, params }) => {
    try {
      const client = await getClient();
      const result = await client.functions.invoke(function_name, params);
      return { content: [{ type: "text", text: JSON.stringify({ function: function_name, result }, null, 2) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

// ─── Tools: Core Integrations ─────────────────────────────────────────────────

server.registerTool(
  "base44_invoke_llm",
  {
    title: "Invoke LLM via Base44",
    description: `Generate AI responses using Base44's core LLM integration.

Args:
  - prompt (string): The prompt to send to the LLM
  - response_format (string, optional): "text" (default) or "json_object"
  - add_context_from_entities (array, optional): Entity names whose data to include as context

Returns: The LLM's generated response.

Example:
  - prompt="Write a welcome email for a new user", response_format="text"`,
    inputSchema: z.object({
      prompt: z.string().describe("Prompt to send to the LLM"),
      response_format: z.enum(["text", "json_object"]).default("text").describe("Response format"),
      add_context_from_entities: z.array(z.string()).optional().describe("Entity names to include as context"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ prompt, response_format, add_context_from_entities }) => {
    try {
      const client = await getClient();
      const integrations = client.integrations as Record<string, any>;
      const result = await integrations.Core.InvokeLLM({
        prompt,
        responseFormat: response_format,
        ...(add_context_from_entities ? { addContextFromEntities: add_context_from_entities } : {}),
      });
      return { content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "base44_send_email",
  {
    title: "Send Email via Base44",
    description: `Send an email through Base44's built-in email integration.

Args:
  - to (string): Recipient email address
  - subject (string): Email subject line
  - html (string): HTML body content
  - text (string, optional): Plain text fallback

Returns: Confirmation of email send.

Example:
  - to="user@example.com", subject="Welcome!", html="<h1>Welcome!</h1>"`,
    inputSchema: z.object({
      to: z.string().email().describe("Recipient email address"),
      subject: z.string().describe("Email subject line"),
      html: z.string().describe("HTML email body"),
      text: z.string().optional().describe("Plain text fallback"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ to, subject, html, text }) => {
    try {
      const client = await getClient();
      const integrations = client.integrations as Record<string, any>;
      const result = await integrations.Core.SendEmail({ to, subject, html, ...(text ? { text } : {}) });
      return { content: [{ type: "text", text: JSON.stringify({ success: true, to, subject, result }, null, 2) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "base44_generate_image",
  {
    title: "Generate Image via Base44",
    description: `Generate an AI image using Base44's core image generation integration.

Args:
  - prompt (string): Description of the image to generate
  - size (string, optional): Image size - "1024x1024" (default), "1024x1792", or "1792x1024"

Returns: Object with the generated image URL.`,
    inputSchema: z.object({
      prompt: z.string().describe("Description of the image to generate"),
      size: z.enum(["1024x1024", "1024x1792", "1792x1024"]).default("1024x1024").describe("Image dimensions"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ prompt, size }) => {
    try {
      const client = await getClient();
      const integrations = client.integrations as Record<string, any>;
      const result = await integrations.Core.GenerateImage({ prompt, size });
      return { content: [{ type: "text", text: JSON.stringify({ url: result.url }, null, 2) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

// ─── Tools: App Logs ──────────────────────────────────────────────────────────

server.registerTool(
  "base44_app_logs",
  {
    title: "Get App Logs",
    description: `Retrieve recent app logs from Base44. Useful for debugging and monitoring.

Args:
  - limit (number, optional): Max log entries to return (default: 50)

Returns: Array of log entries with timestamps and messages.`,
    inputSchema: z.object({
      limit: z.number().int().min(1).max(500).default(50).describe("Max log entries to return"),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ limit }) => {
    try {
      const client = await getClient();
      const appLogs = client["app-logs"] as Record<string, any> | undefined;
      if (!appLogs) {
        return { content: [{ type: "text", text: "Error: app-logs module not available on this Base44 client version." }] };
      }
      const logs = await appLogs.list({ limit });
      return { content: [{ type: "text", text: JSON.stringify({ count: logs.length, logs }, null, 2) }] };
    } catch (err: unknown) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

// ─── Express Server with SSE ──────────────────────────────────────────────────

const app = express();
const sessions = new Map<string, SSEServerTransport>();

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", server: "base44-mcp-server", appId: APP_ID });
});

app.get("/sse", async (req: Request, res: Response) => {
  const transport = new SSEServerTransport("/messages", res);
  sessions.set(transport.sessionId, transport);
  res.on("close", () => sessions.delete(transport.sessionId));
  await server.connect(transport);
});

app.post("/messages", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = sessions.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  await transport.handlePostMessage(req, res);
});

app.listen(PORT, () => {
  console.log(`Base44 MCP Server running on port ${PORT}`);
  console.log(`  SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`  Health:       http://localhost:${PORT}/health`);
  console.log(`  App ID:       ${APP_ID}`);
  console.log(`  Auth:         ${EMAIL ? "email/password" : "anonymous"}`);
});
