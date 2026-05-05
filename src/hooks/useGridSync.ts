import { useEffect, useRef, useCallback, useState } from 'react'
import { useBoggleStore } from '../store/boggleStore'

export interface SyncStatus {
  connected: boolean
  isHost: boolean
  sessionActive: boolean
  remainingMs: number
  error: string | null
}

// Connect to the sync server running on the same host, port 5174
function getSyncUrl(): string {
  const host = window.location.hostname
  return `ws://${host}:5174`
}

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
    // Allow local changes to broadcast again after a tick
    setTimeout(() => { isApplyingRemote.current = false }, 50)
  }, [setGridSize, setLetter])

  useEffect(() => {
    let ws: WebSocket
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let destroyed = false

    function connect() {
      try {
        ws = new WebSocket(getSyncUrl())
        wsRef.current = ws
      } catch {
        return  // Not available (production build, etc.)
      }

      ws.onopen = () => {
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
          if (!msg.isHost) {
            applyRemoteGrid(msg.letters as string[][], msg.gridSize as number)
          }
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
        if (pingInterval.current) clearInterval(pingInterval.current)
        setStatus((s) => ({ ...s, connected: false, sessionActive: false }))
        if (!destroyed) reconnectTimer = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        // Silently fail — sync server is optional (not available in production)
      }
    }

    connect()

    return () => {
      destroyed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pingInterval.current) clearInterval(pingInterval.current)
      wsRef.current?.close()
    }
  }, [applyRemoteGrid])

  // Broadcast grid changes to the server when this client is host
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
