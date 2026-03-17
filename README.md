# base44-mcp-server

MCP server for [Base44](https://base44.com) - lets Claude interact with your Base44 app's entities, backend functions, and core integrations.

## Tools

| Tool | Description |
|---|---|
| `base44_entity_list` | List all records from an entity with sorting and pagination |
| `base44_entity_get` | Get a single record by ID |
| `base44_entity_filter` | Filter records by field values |
| `base44_entity_create` | Create a new record |
| `base44_entity_update` | Update an existing record |
| `base44_entity_delete` | Delete a single record |
| `base44_entity_delete_many` | Delete multiple records matching filters |
| `base44_entity_bulk_create` | Create multiple records at once |
| `base44_function_invoke` | Invoke a backend function |
| `base44_auth_me` | Get the current authenticated user |
| `base44_auth_check` | Check authentication status |
| `base44_invoke_llm` | Generate AI responses via Base44's LLM integration |
| `base44_send_email` | Send email via Base44 |
| `base44_generate_image` | Generate an AI image via Base44 |
| `base44_app_logs` | Retrieve recent app logs |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `BASE44_APP_ID` | Yes | Your Base44 app ID (from editor URL) |
| `BASE44_EMAIL` | No | Email for authenticated access |
| `BASE44_PASSWORD` | No | Password for authenticated access |
| `PORT` | No | Server port (default: 3000) |

Find your app ID in the Base44 editor URL:
```
https://app.base44.com/apps/<YOUR_APP_ID>/editor/...
```

## Deployment (Railway)

Connect this repo to a Railway project and set the environment variables above.

## SSE Endpoint

```
https://your-deployment.up.railway.app/sse
```
