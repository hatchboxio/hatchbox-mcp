import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction, WRITE } from "./helpers.js";

const serverIdSchema = {
  cluster_id: z.number().int().describe("Numeric cluster id (see hatchbox_list_account_clusters)."),
  server_id: z.number().int().describe("Numeric server id (see hatchbox_list_servers)."),
};

const firewallRuleIdSchema = {
  ...serverIdSchema,
  firewall_rule_id: z.number().int().describe("Numeric firewall rule id (see hatchbox_list_firewall_rules)."),
};

export function registerFirewallRulesTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_list_firewall_rules",
    {
      title: "List Server Firewall Rules",
      description:
        "List the firewall (ufw) rules on a Hatchbox server, lowest port first. Paginated: results come back as " +
        "`{ firewall_rules, pagination }`, where `pagination` has current_page/total_pages/total_count/page_limit; " +
        "`limit` is capped at 100 server-side regardless of what's requested.",
      inputSchema: {
        ...serverIdSchema,
        page: z.number().int().optional().describe("Page number, 1-indexed. Defaults to 1."),
        limit: z.number().int().optional().describe("Results per page. Defaults to and is capped at 100."),
      },
      annotations: READ_ONLY,
    },
    async ({ cluster_id, server_id, page, limit }) =>
      runAction(async () => {
        const { data, headers } = await client.getPaginated(`/clusters/${cluster_id}/servers/${server_id}/firewall_rules`, {
          page,
          limit,
        });
        return jsonResult({
          firewall_rules: data,
          pagination: {
            current_page: Number(headers["current-page"]),
            total_pages: Number(headers["total-pages"]),
            total_count: Number(headers["total-count"]),
            page_limit: Number(headers["page-limit"]),
          },
        });
      }),
  );

  server.registerTool(
    "hatchbox_get_firewall_rule",
    {
      title: "Get Server Firewall Rule",
      description: "Fetch a single firewall rule on a Hatchbox server.",
      inputSchema: firewallRuleIdSchema,
      annotations: READ_ONLY,
    },
    async ({ cluster_id, server_id, firewall_rule_id }) =>
      runAction(async () =>
        jsonResult(await client.get(`/clusters/${cluster_id}/servers/${server_id}/firewall_rules/${firewall_rule_id}`)),
      ),
  );

  server.registerTool(
    "hatchbox_create_firewall_rule",
    {
      title: "Create Server Firewall Rule",
      description:
        "Add a firewall (ufw) rule to a Hatchbox server. Works even if the server has no IP address yet — the rule " +
        "is applied the next time the server is provisioned. Fails with a 422 if it duplicates an existing rule " +
        "(same port/action/from) or if `from` isn't a valid IP address or CIDR range. Asynchronous — returns the " +
        "created record plus a log_id, follow up with hatchbox_get_log.",
      inputSchema: {
        ...serverIdSchema,
        port: z.number().int().min(0).max(65535).describe("Port number, 0-65535."),
        action: z.enum(["allow", "deny"]).optional().describe("Defaults to 'allow'."),
        from: z
          .string()
          .optional()
          .describe("Restrict the rule to a single IP address or CIDR range. Omit to apply it to any address."),
        description: z.string().optional().describe("Free-text label for the rule."),
      },
      annotations: WRITE,
    },
    async ({ cluster_id, server_id, port, action, from, description }) =>
      runAction(async () =>
        jsonResult(
          await client.post(`/clusters/${cluster_id}/servers/${server_id}/firewall_rules`, {
            firewall_rule: { port, action, from, description },
          }),
        ),
      ),
  );

  server.registerTool(
    "hatchbox_delete_firewall_rule",
    {
      title: "Delete Server Firewall Rule",
      description:
        "Remove a firewall rule from a Hatchbox server. Fails with a 422 if the rule is one Hatchbox manages itself " +
        "(SSH, and 80/443 on web servers — check `removable` on the record) or if the server has no reachable IP " +
        "address. Asynchronous — returns an id (the log id, not named log_id for this endpoint), follow up with " +
        "hatchbox_get_log.",
      inputSchema: firewallRuleIdSchema,
      annotations: WRITE,
    },
    async ({ cluster_id, server_id, firewall_rule_id }) =>
      runAction(async () =>
        jsonResult(await client.delete(`/clusters/${cluster_id}/servers/${server_id}/firewall_rules/${firewall_rule_id}`)),
      ),
  );
}
