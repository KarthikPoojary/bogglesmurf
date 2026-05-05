#!/usr/bin/env node
// BoggleSmurf local sync server — WebSocket on port 5174
// Broadcasts the active grid session to everyone on the same network.
// Run alongside Vite: ./scripts/dev.sh handles this automatically.

import { WebSocketServer, WebSocket } from 'ws'

const PORT = 5174
const SESSION_TTL_MS = 120_000  // 120 seconds

const wss = new WebSocketServer({ port: PORT })

let session = null  // { letters, gridSize, startedAt, hostId, timer }
const clients = new Set()

function broadcast(msg, excludeId = null) {
  const payload = JSON.stringify(msg)
  for (const ws of clients) {
    if (ws.id !== excludeId && ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    }
  }
}

function endSession(reason = 'expired') {
  if (!session) return
  clearTimeout(session.timer)
  session = null
  broadcast({ type: 'session-ended', reason })
  console.log(`[sync] session ended (${reason})`)
}

function remainingMs() {
  if (!session) return 0
  return Math.max(0, SESSION_TTL_MS - (Date.now() - session.startedAt))
}

let clientCounter = 0

wss.on('connection', (ws) => {
  ws.id = ++clientCounter
  clients.add(ws)
  console.log(`[sync] client ${ws.id} connected (${clients.size} total)`)

  // Send current session state immediately on connect
  if (session) {
    ws.send(JSON.stringify({
      type: 'session-active',
      letters: session.letters,
      gridSize: session.gridSize,
      remainingMs: remainingMs(),
      hostId: session.hostId,
      isHost: session.hostId === ws.id,
    }))
  } else {
    ws.send(JSON.stringify({ type: 'no-session' }))
  }

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }

    if (msg.type === 'set-grid') {
      // Anyone can start a new session when there's none active
      if (session) {
        // Only host can update the grid mid-session
        if (session.hostId !== ws.id) {
          ws.send(JSON.stringify({ type: 'error', message: 'Session already active. Wait for it to expire.' }))
          return
        }
        // Host updating grid — reset timer
        clearTimeout(session.timer)
      } else {
        console.log(`[sync] new session started by client ${ws.id}`)
      }

      session = {
        letters: msg.letters,
        gridSize: msg.gridSize,
        startedAt: Date.now(),
        hostId: ws.id,
        timer: setTimeout(() => endSession('expired'), SESSION_TTL_MS),
      }

      // Broadcast to everyone including sender (sender gets isHost=true)
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'session-active',
            letters: session.letters,
            gridSize: session.gridSize,
            remainingMs: SESSION_TTL_MS,
            hostId: session.hostId,
            isHost: client.id === session.hostId,
          }))
        }
      }

    } else if (msg.type === 'end-session') {
      if (session?.hostId === ws.id) endSession('host-ended')

    } else if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', remainingMs: remainingMs() }))
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
    console.log(`[sync] client ${ws.id} disconnected (${clients.size} remaining)`)
    // If host disconnects, give them a grace period — don't kill session immediately
  })

  ws.on('error', (e) => console.error(`[sync] client ${ws.id} error:`, e.message))
})

console.log(`[sync] WebSocket server running on ws://0.0.0.0:${PORT}`)
