import { useLiveStore } from '@/store/liveStore'

// How often a query should poll: not at all while the agent pushes the data over the live socket,
// and on its own interval when the socket is down or the agent does not push (an older agent)
export function useLivePolling(intervalMs: number): number | false {
  const pushed = useLiveStore((s) => s.connected && s.statePush)
  return pushed ? false : intervalMs
}
