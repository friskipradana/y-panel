// Only the application's own pages (the desktop and the full-page database manager) send a visitor
// to the login form. Everything else, including addresses that do not exist, is reachable without
// a session: a 401 there is expected and the visitor sees the page, or its 404.
export function isProtectedRoute(pathname: string) {
  return pathname === '/home' || pathname.startsWith('/home/') || pathname.startsWith('/database/')
}

export function isPublicRoute(pathname: string) {
  return !isProtectedRoute(pathname)
}
