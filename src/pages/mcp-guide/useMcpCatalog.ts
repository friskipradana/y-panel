import { useQuery } from '@tanstack/react-query'
import { agentApi } from '@/api/client'
import { MCP_TOOLS, MCP_TOOL_COUNTS, type McpToolInfo } from './toolsData'

interface McpCatalog {
  tools: McpToolInfo[]
  counts: { anonymous: number; user: number; admin: number }
}

const fallback: McpCatalog = { tools: MCP_TOOLS, counts: { ...MCP_TOOL_COUNTS } }

// The agent reports the tools it really registers per access level. The snapshot in
// toolsData.ts is only the fallback for an agent that predates /api/v1/mcp-catalog.
export function useMcpCatalog(): McpCatalog & { live: boolean } {
  const { data } = useQuery({
    queryKey: ['mcp', 'catalog'],
    queryFn: () => agentApi.get<McpCatalog>('/api/v1/mcp-catalog').then((r) => r.data),
    staleTime: 5 * 60_000,
    retry: false,
  })
  if (data && Array.isArray(data.tools) && data.tools.length > 0 && data.counts) {
    return { tools: data.tools, counts: data.counts, live: true }
  }
  return { ...fallback, live: false }
}
