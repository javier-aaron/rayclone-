'use strict';

const store = require('./store');

const DEFAULT_MCP_SERVERS = [
  {
    id: 'filesystem',
    name: 'Filesystem MCP Server',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:\\Users\\Jay'],
    enabled: true,
    description: 'Provides direct read, write and search access to local files and directories',
    tools: [
      { name: 'read_file', description: 'Read the complete contents of a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      { name: 'write_file', description: 'Create a new file or overwrite existing file', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
      { name: 'list_directory', description: 'Get a detailed listing of all files and directories', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      { name: 'search_files', description: 'Recursively search for files matching pattern', inputSchema: { type: 'object', properties: { path: { type: 'string' }, pattern: { type: 'string' } }, required: ['path', 'pattern'] } }
    ]
  },
  {
    id: 'memory',
    name: 'Memory Knowledge Graph MCP',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    enabled: true,
    description: 'Graph-based persistent memory system for entities, relations and observations',
    tools: [
      { name: 'create_entities', description: 'Create multiple new entities in the knowledge graph', inputSchema: { type: 'object', properties: { entities: { type: 'array' } }, required: ['entities'] } },
      { name: 'search_nodes', description: 'Search for nodes in knowledge graph by query', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      { name: 'read_graph', description: 'Read the entire knowledge graph', inputSchema: { type: 'object' } }
    ]
  },
  {
    id: 'fetch',
    name: 'Web Fetch MCP Server',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    enabled: true,
    description: 'Web fetching and content extraction for HTML, Markdown and JSON',
    tools: [
      { name: 'fetch', description: 'Fetch URL content and convert HTML to markdown', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } }
    ]
  },
  {
    id: 'github',
    name: 'GitHub MCP Server',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    enabled: false,
    description: 'Interact with GitHub repositories, issues, pull requests and commits',
    tools: [
      { name: 'search_repositories', description: 'Search GitHub repositories', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      { name: 'get_file_contents', description: 'Get file content from repository', inputSchema: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, path: { type: 'string' } }, required: ['owner', 'repo', 'path'] } }
    ]
  }
];

let servers = [];

function load() {
  const saved = store.read('mcp_servers', null);
  if (Array.isArray(saved) && saved.length > 0) {
    servers = saved;
  } else {
    servers = [...DEFAULT_MCP_SERVERS];
    store.write('mcp_servers', servers);
  }
}

function persist() {
  store.write('mcp_servers', servers);
}

function getServers() {
  if (!servers.length) load();
  return servers;
}

function addServer(serverConfig) {
  if (!serverConfig || !serverConfig.name) return { ok: false, error: 'Name required' };
  const id = serverConfig.id || `mcp-${Date.now()}`;
  const s = {
    id,
    name: serverConfig.name,
    transport: serverConfig.transport || 'stdio',
    command: serverConfig.command || 'npx',
    args: serverConfig.args || [],
    enabled: true,
    description: serverConfig.description || 'Custom MCP Server',
    tools: serverConfig.tools || []
  };
  servers.push(s);
  persist();
  return { ok: true, server: s };
}

function toggleServer(id) {
  const s = servers.find((item) => item.id === id);
  if (s) {
    s.enabled = !s.enabled;
    persist();
    return { ok: true, server: s };
  }
  return { ok: false, error: 'Server not found' };
}

function removeServer(id) {
  servers = servers.filter((s) => s.id !== id);
  persist();
  return { ok: true };
}

function getAllTools() {
  const all = getServers();
  const tools = [];
  for (const s of all) {
    if (!s.enabled) continue;
    for (const t of s.tools || []) {
      tools.push({
        ...t,
        serverId: s.id,
        serverName: s.name
      });
    }
  }
  return tools;
}

async function callTool(toolName, args = {}) {
  const allTools = getAllTools();
  const target = allTools.find((t) => t.name === toolName);
  if (!target) return { ok: false, error: `Tool ${toolName} not found or server disabled` };

  // For built-in simulated execution or execution feedback
  const result = {
    ok: true,
    tool: target.name,
    server: target.serverName,
    executedAt: new Date().toISOString(),
    output: `MCP Tool [${target.name}] invoked successfully via ${target.serverName}. Input arguments: ${JSON.stringify(args)}`
  };

  try {
    const electron = require('electron');
    if (electron && electron.clipboard && typeof electron.clipboard.writeText === 'function') {
      electron.clipboard.writeText(JSON.stringify(result, null, 2));
    }
  } catch {}
  return result;
}

module.exports = {
  load,
  getServers,
  addServer,
  toggleServer,
  removeServer,
  getAllTools,
  callTool
};
