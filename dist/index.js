#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const axios_1 = __importDefault(require("axios"));
// CRITICAL FIX: Suppress any potential stdout pollution
// Override console.log to only go to stderr during MCP communication
const originalConsoleLog = console.log;
console.log = (...args) => {
    console.error(...args); // Redirect to stderr instead of stdout
};
// Environment variables are provided by Amazon Q MCP configuration
// Confluence API configuration
const CONFLUENCE_BASE_URL = process.env.CONFLUENCE_BASE_URL;
const CONFLUENCE_EMAIL = process.env.CONFLUENCE_EMAIL;
const CONFLUENCE_API_TOKEN = process.env.CONFLUENCE_API_TOKEN;
if (!CONFLUENCE_BASE_URL || !CONFLUENCE_EMAIL || !CONFLUENCE_API_TOKEN) {
    throw new Error("Missing required Confluence configuration in environment variables");
}
// Create axios instance with auth
const confluenceApi = axios_1.default.create({
    baseURL: `${CONFLUENCE_BASE_URL}/rest/api`,
    auth: {
        username: CONFLUENCE_EMAIL,
        password: CONFLUENCE_API_TOKEN,
    },
    headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
    },
});
// Define available tools
const TOOLS = [
    {
        name: "confluence_get_page",
        description: "Get a Confluence page by ID or title",
        inputSchema: {
            type: "object",
            properties: {
                pageId: {
                    type: "string",
                    description: "The ID of the Confluence page",
                },
                pageTitle: {
                    type: "string",
                    description: "The title of the Confluence page (alternative to ID)",
                },
                spaceKey: {
                    type: "string",
                    description: "The space key where the page is located (required if using title)",
                },
                includeBody: {
                    type: "boolean",
                    description: "Whether to include the page body content (default: true)",
                    default: true,
                },
            },
            oneOf: [
                { required: ["pageId"] },
                { required: ["pageTitle", "spaceKey"] },
            ],
        },
    },
    {
        name: "confluence_search",
        description: "Search for Confluence pages",
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "CQL (Confluence Query Language) search query",
                },
                limit: {
                    type: "number",
                    description: "Maximum number of results to return (default: 1000)",
                    default: 1000,
                },
            },
            required: ["query"],
        },
    },
    {
        name: "confluence_get_space_pages",
        description: "List all pages in a Confluence space",
        inputSchema: {
            type: "object",
            properties: {
                spaceKey: {
                    type: "string",
                    description: "The key of the Confluence space",
                },
                limit: {
                    type: "number",
                    description: "Maximum number of pages to return (default: 1000)",
                    default: 1000,
                },
            },
            required: ["spaceKey"],
        },
    },
    {
        name: "confluence_get_child_pages",
        description: "Get child pages of a specific Confluence page",
        inputSchema: {
            type: "object",
            properties: {
                pageId: {
                    type: "string",
                    description: "The ID of the parent page",
                },
                limit: {
                    type: "number",
                    description: "Maximum number of child pages to return (default: 1000)",
                    default: 1000,
                },
            },
            required: ["pageId"],
        },
    },
    {
        name: "confluence_list_spaces",
        description: "List all Confluence spaces you have access to",
        inputSchema: {
            type: "object",
            properties: {
                limit: {
                    type: "number",
                    description: "Maximum number of spaces to return (default: 1000)",
                    default: 1000,
                },
            },
        },
    },
];
// Helper function to convert HTML to plain text (basic implementation)
function htmlToPlainText(html) {
    return html
        .replace(/<[^>]*>/g, "") // Remove HTML tags
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();
}
// Create and configure the MCP server
const server = new index_js_1.Server({
    name: "mcp-server-confluence",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// Handle tool listing
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
    return {
        tools: TOOLS,
    };
});
// Handle tool execution
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (!args) {
        throw new Error("No arguments provided");
    }
    try {
        switch (name) {
            case "confluence_get_page": {
                let pageId = args.pageId;
                // If pageTitle is provided instead of pageId, search for the page
                if (!pageId && args.pageTitle && args.spaceKey) {
                    const searchResponse = await confluenceApi.get("/content", {
                        params: {
                            title: args.pageTitle,
                            spaceKey: args.spaceKey,
                            limit: 1,
                        },
                    });
                    if (searchResponse.data.results.length === 0) {
                        throw new Error(`Page not found with title: ${args.pageTitle}`);
                    }
                    pageId = searchResponse.data.results[0].id;
                }
                const expand = args.includeBody !== false
                    ? "body.storage,version,space,ancestors"
                    : "version,space,ancestors";
                const response = await confluenceApi.get(`/content/${pageId}`, {
                    params: { expand },
                });
                const page = response.data;
                const result = {
                    id: page.id,
                    title: page.title,
                    type: page.type,
                    space: page.space?.name,
                    spaceKey: page.space?.key,
                    version: page.version?.number,
                    webUrl: `${CONFLUENCE_BASE_URL}/spaces/${page.space?.key}/pages/${page.id}`,
                    lastModified: page.version?.when,
                    lastModifiedBy: page.version?.by?.displayName,
                };
                if (args.includeBody !== false && page.body?.storage?.value) {
                    result.content = htmlToPlainText(page.body.storage.value);
                }
                // Include breadcrumb if ancestors exist
                if (page.ancestors && page.ancestors.length > 0) {
                    result.breadcrumb = page.ancestors.map((a) => a.title).join(" > ");
                }
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            }
            case "confluence_search": {
                const query = args.query;
                const limit = args.limit || 1000;
                const response = await confluenceApi.get("/content/search", {
                    params: {
                        cql: query,
                        limit,
                        expand: "space,version",
                    },
                });
                const results = response.data.results.map((item) => ({
                    id: item.id,
                    title: item.title,
                    type: item.type,
                    space: item.space?.name,
                    spaceKey: item.space?.key,
                    webUrl: `${CONFLUENCE_BASE_URL}/spaces/${item.space?.key}/pages/${item.id}`,
                    lastModified: item.version?.when,
                }));
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(results, null, 2),
                        },
                    ],
                };
            }
            case "confluence_get_space_pages": {
                const spaceKey = args.spaceKey;
                const limit = args.limit || 1000;
                const response = await confluenceApi.get("/content", {
                    params: {
                        spaceKey,
                        limit,
                        expand: "version",
                        type: "page",
                    },
                });
                const pages = response.data.results.map((page) => ({
                    id: page.id,
                    title: page.title,
                    webUrl: `${CONFLUENCE_BASE_URL}/spaces/${spaceKey}/pages/${page.id}`,
                    lastModified: page.version?.when,
                    lastModifiedBy: page.version?.by?.displayName,
                }));
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                spaceKey,
                                totalPages: response.data.size,
                                pages,
                            }, null, 2),
                        },
                    ],
                };
            }
            case "confluence_get_child_pages": {
                const pageId = args.pageId;
                const limit = args.limit || 1000;
                const response = await confluenceApi.get(`/content/${pageId}/child/page`, {
                    params: {
                        limit,
                        expand: "version,space",
                    },
                });
                const childPages = response.data.results.map((page) => ({
                    id: page.id,
                    title: page.title,
                    webUrl: `${CONFLUENCE_BASE_URL}/spaces/${page.space?.key}/pages/${page.id}`,
                    lastModified: page.version?.when,
                    lastModifiedBy: page.version?.by?.displayName,
                }));
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                parentPageId: pageId,
                                totalChildren: response.data.size,
                                children: childPages,
                            }, null, 2),
                        },
                    ],
                };
            }
            case "confluence_list_spaces": {
                const limit = args.limit || 1000;
                const response = await confluenceApi.get("/space", {
                    params: {
                        limit,
                        expand: "description.plain,homepage",
                    },
                });
                const spaces = response.data.results.map((space) => ({
                    id: space.id,
                    key: space.key,
                    name: space.name,
                    type: space.type,
                    description: space.description?.plain?.value || "",
                    webUrl: `${CONFLUENCE_BASE_URL}/spaces/${space.key}`,
                    homepageId: space.homepage?.id,
                }));
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                totalSpaces: response.data.size,
                                spaces,
                            }, null, 2),
                        },
                    ],
                };
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        const errorMessage = error.response?.data?.message || error.message || "An error occurred";
        return {
            content: [
                {
                    type: "text",
                    text: `Error: ${errorMessage}`,
                },
            ],
            isError: true,
        };
    }
});
// Start the server
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("Confluence MCP server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map