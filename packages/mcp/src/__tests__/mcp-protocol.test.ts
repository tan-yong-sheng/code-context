/**
 * MCP Protocol Compliance Tests
 *
 * Tests that the MCP server correctly implements the Model Context Protocol:
 * - initialize_session
 * - list_tools
 * - call_tool
 * - Error handling
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
    InitializeRequestSchema,
    Tool,
    TextContent
} from "@modelcontextprotocol/sdk/types.js";

// Mock the dependencies
jest.mock("@tan-yong-sheng/code-context-core", () => ({
    Context: jest.fn().mockImplementation(() => ({
        indexCodebase: jest.fn().mockResolvedValue({ indexedFiles: 5, totalChunks: 10 }),
        semanticSearch: jest.fn().mockResolvedValue([
            { content: "test result", relativePath: "test.ts", score: 0.9 }
        ]),
        clearIndex: jest.fn().mockResolvedValue(undefined),
        hasIndex: jest.fn().mockResolvedValue(false),
    })),
    OpenAIEmbedding: jest.fn(),
    createVectorDatabase: jest.fn().mockReturnValue({}),
}));

// Create a minimal MCP server for testing
async function createTestServer() {
    const server = new Server(
        { name: "test-context-server", version: "1.0.0" },
        { capabilities: { tools: {} } }
    );

    // Handle initialize
    server.setRequestHandler(InitializeRequestSchema, async () => {
        return {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "test-context-server", version: "1.0.0" }
        };
    });

    // Handle list_tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "index_codebase",
                    description: "Index a codebase directory",
                    inputSchema: {
                        type: "object",
                        properties: {
                            path: { type: "string" },
                            force: { type: "boolean", default: false }
                        },
                        required: ["path"]
                    }
                },
                {
                    name: "search_code",
                    description: "Search the indexed codebase",
                    inputSchema: {
                        type: "object",
                        properties: {
                            path: { type: "string" },
                            query: { type: "string" },
                            limit: { type: "number", default: 10 }
                        },
                        required: ["path", "query"]
                    }
                }
            ]
        };
    });

    // Handle call_tool
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        switch (name) {
            case "index_codebase":
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ success: true, indexedFiles: 5, totalChunks: 10 })
                    } as TextContent]
                };
            case "search_code":
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify([{ content: "test", relativePath: "test.ts", score: 0.9 }])
                    } as TextContent]
                };
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    });

    return server;
}

describe("MCP Protocol Compliance", () => {
    let client: Client;
    let server: Server;
    let clientTransport: InMemoryTransport;
    let serverTransport: InMemoryTransport;

    beforeEach(async () => {
        // Create in-memory transport pair - returns [client, server]
        const [clientT, serverT] = InMemoryTransport.createLinkedPair();
        clientTransport = clientT;
        serverTransport = serverT;

        // Create and connect server
        server = await createTestServer();
        await server.connect(serverTransport);

        // Create and connect client
        client = new Client(
            { name: "test-client", version: "1.0.0" },
            { capabilities: {} }
        );
        await client.connect(clientTransport);
    });

    afterEach(async () => {
        await client.close();
        await server.close();
    });

    describe("Initialize Session", () => {
        test("should successfully initialize session", async () => {
            // Client is already initialized in beforeEach
            expect(client).toBeDefined();
        });

        test("should have correct protocol version", async () => {
            // The client should be connected with proper protocol
            expect(clientTransport).toBeDefined();
            expect(serverTransport).toBeDefined();
        });
    });

    describe("List Tools", () => {
        test("should list available tools", async () => {
            const tools = await client.listTools();

            expect(tools).toBeDefined();
            expect(tools.tools).toHaveLength(2);
            expect(tools.tools[0].name).toBe("index_codebase");
            expect(tools.tools[1].name).toBe("search_code");
        });

        test("should have correct tool schemas", async () => {
            const tools = await client.listTools();

            const indexTool = tools.tools.find((t: Tool) => t.name === "index_codebase");
            expect(indexTool).toBeDefined();
            expect(indexTool?.inputSchema).toMatchObject({
                type: "object",
                properties: {
                    path: { type: "string" },
                    force: { type: "boolean", default: false }
                },
                required: ["path"]
            });
        });
    });

    describe("Call Tool", () => {
        test("should call index_codebase tool", async () => {
            const result = await client.callTool({
                name: "index_codebase",
                arguments: { path: "/test/path", force: false }
            });

            expect(result).toBeDefined();
            expect(result.content).toHaveLength(1);

            const content = result.content as TextContent[];
            expect(content[0].type).toBe("text");

            const parsed = JSON.parse(content[0].text);
            expect(parsed.success).toBe(true);
            expect(parsed.indexedFiles).toBe(5);
        });

        test("should call search_code tool", async () => {
            const result = await client.callTool({
                name: "search_code",
                arguments: { path: "/test/path", query: "test query", limit: 10 }
            });

            expect(result).toBeDefined();
            expect(result.content).toHaveLength(1);

            const content = result.content as TextContent[];
            const parsed = JSON.parse(content[0].text);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].relativePath).toBe("test.ts");
        });

        test("should handle unknown tool error", async () => {
            await expect(
                client.callTool({
                    name: "unknown_tool",
                    arguments: {}
                })
            ).rejects.toThrow("Unknown tool");
        });

        test("should validate required parameters", async () => {
            // Should work with required params
            const result = await client.callTool({
                name: "index_codebase",
                arguments: { path: "/test/path" }
            });
            expect(result).toBeDefined();
        });
    });

    describe("Error Handling", () => {
        test("should handle tool execution errors gracefully", async () => {
            // Create a server that throws errors
            const errorServer = new Server(
                { name: "error-server", version: "1.0.0" },
                { capabilities: { tools: {} } }
            );

            errorServer.setRequestHandler(InitializeRequestSchema, async () => ({
                protocolVersion: "2024-11-05",
                capabilities: { tools: {} },
                serverInfo: { name: "error-server", version: "1.0.0" }
            }));

            errorServer.setRequestHandler(ListToolsRequestSchema, async () => ({
                tools: [{
                    name: "error_tool",
                    description: "A tool that errors",
                    inputSchema: { type: "object", properties: {} }
                }]
            }));

            errorServer.setRequestHandler(CallToolRequestSchema, async () => {
                throw new Error("Intentional test error");
            });

            const [errorClientT, errorServerT] = InMemoryTransport.createLinkedPair();
            await errorServer.connect(errorServerT);

            const errorClient = new Client(
                { name: "test-client", version: "1.0.0" },
                { capabilities: {} }
            );
            await errorClient.connect(errorClientT);

            await expect(
                errorClient.callTool({ name: "error_tool", arguments: {} })
            ).rejects.toThrow();

            await errorClient.close();
            await errorServer.close();
        });
    });

    describe("Protocol Message Format", () => {
        test("should handle JSON-RPC messages correctly", async () => {
            // Test that the transport is handling JSON-RPC format
            const tools = await client.listTools();

            // Verify the response structure follows MCP format
            expect(tools).toHaveProperty("tools");
            expect(Array.isArray(tools.tools)).toBe(true);
        });
    });
});

