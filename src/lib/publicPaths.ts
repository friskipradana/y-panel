// Pages that must stay reachable without a session. A 401 on them is expected
// and must not bounce the visitor to the login page.
const PUBLIC_PATHS = ['/', '/docs/mcp', '/mcp/guide']

export function isPublicRoute(pathname: string, loginPath = import.meta.env.VITE_LOGIN_PATH || '/login') {
  return pathname === loginPath || PUBLIC_PATHS.includes(pathname) || pathname === '/articles' || pathname.startsWith('/articles/')
}
