import { useEffect, useRef, useCallback, useState } from 'react'
import { useBoggleStore } from '../store/boggleStore'

export interface SyncStatus {
  connected: boolean
  isHost: boolean
  sessionActive: boolean
  remainingMs: number
  error: string | null
}

function getSyncUrl(): string {
  return `ws://${window.location.hostname}:5174`
}

const BACKOFF_BASE = 2000   // start at 2s
const BACKOFF_MAX = 30000   // cap at 30s
const MAX_FAST_FAILURES = 3 // after 3 instant failures, assume server not running → stop

export function useGridSync() {
  const { letters, gridSize, setLetter, setGridSize } = useBoggleStore()
  const wsRef = useRef<WebSocket | null>(null)
  const isApplyingRemote = useRef(false)
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const [status, setStatus] = useState<SyncStatus>({
    connected: false,
    isHost: false,
    sessionActive: false,
    remainingMs: 0,
    error: null,
  })

  const applyRemoteGrid = useCallback((remoteLetters: string[][], remoteSize: number) => {
    isApplyingRemote.current = true
    setGridSize(remoteSize as 4 | 5 | 6)
    for (let r = 0; r < remoteSize; r++) {
      for (let c = 0; c < remoteSize; c++) {
        setLetter(r, c, remoteLetters[r]?.[c] ?? '')
      }
    }
    setTimeout(() => { isApplyingRemote.current = false }, 50)
  }, [setGridSize, setLetter])

  useEffect(() => {
    let destroyed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0
    let fastFailures = 0  // connections that closed before onopen fired

    function connect() {
      if (destroyed) return

      let openFired = false
      let ws: WebSocket
      try {
        ws = new WebSocket(getSyncUrl())
      } catch {
        return // WebSocket not available (SSR, etc.)
      }
      wsRef.current = ws

      ws.onopen = () => {
        openFired = true
        attempt = 0
        fastFailures = 0
        setStatus((s) => ({ ...s, connected: true, error: null }))
        pingInterval.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
        }, 5000)
      }

      ws.onmessage = (e) => {
        let msg: Record<string, unknown>
        try { msg = JSON.parse(e.data as string) } catch { return }

        if (msg.type === 'session-active') {
          setStatus((s) => ({
            ...s,
            isHost: msg.isHost as boolean,
            sessionActive: true,
            remainingMs: msg.remainingMs as number,
          }))
          if (!msg.isHost) applyRemoteGrid(msg.letters as string[][], msg.gridSize as number)
        } else if (msg.type === 'no-session') {
          setStatus((s) => ({ ...s, sessionActive: false, remainingMs: 0 }))
        } else if (msg.type === 'session-ended') {
          setStatus((s) => ({ ...s, sessionActive: false, remainingMs: 0, isHost: false }))
        } else if (msg.type === 'pong') {
          setStatus((s) => ({ ...s, remainingMs: msg.remainingMs as number }))
        } else if (msg.type === 'error') {
          setStatus((s) => ({ ...s, error: msg.message as string }))
          setTimeout(() => setStatus((s) => ({ ...s, error: null })), 3000)
        }
      }

      ws.onclose = () => {
        if (pingInterval.current) { clearInterval(pingInterval.current); pingInterval.current = null }
        setStatus((s) => ({ ...s, connected: false, sessionActive: false }))

        if (!openFired) fastFailures++

        // If the server has never been reachable after several attempts, stop retrying.
        // User is running `pnpm dev` without the sync server — that's fine.
        if (fastFailures >= MAX_FAST_FAILURES) return

        if (!destroyed) {
          // Exponential backoff: 2s, 4s, 8s … capped at 30s
          const delay = Math.min(BACKOFF_BASE * 2 ** attempt, BACKOFF_MAX)
          attempt++
          reconnectTimer = setTimeout(connect, delay)
        }
      }

      ws.onerror = () => { /* swallow — onclose handles retry */ }
    }

    connect()

    return () => {
      destroyed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pingInterval.current) clearInterval(pingInterval.current)
      wsRef.current?.close()
    }
  }, [applyRemoteGrid])

  const broadcastGrid = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN || isApplyingRemote.current) return
    ws.send(JSON.stringify({ type: 'set-grid', letters, gridSize }))
  }, [letters, gridSize])

  const endSession = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'end-session' }))
  }, [])

  return { status, broadcastGrid, endSession }
}
