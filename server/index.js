import http from 'node:http'
import express from 'express'
import cors from 'cors'
import { Server } from 'socket.io'
import postsRouter from './routes/posts.js'
import { setIO } from './realtime.js'
import { authorizeChat, parseDeviceId } from './chat.js'

const app = express()
const PORT = Number(process.env.PORT) || 3001

app.use(cors())
app.use(express.json({ limit: '64kb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'disaster-relief-api' })
})

app.use('/api/posts', postsRouter)

app.use((err, _req, res, _next) => {
  console.error(err)
  const status = err.status ?? err.statusCode ?? 500
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message || 'Request failed',
  })
})

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  },
})

setIO(io)

io.on('connection', (socket) => {
  socket.emit('realtime:ready', { ok: true })

  socket.on('chat:join', (payload = {}) => {
    const postId = typeof payload.postId === 'string' ? payload.postId : ''
    const deviceId = parseDeviceId(payload.deviceId)
    const auth = authorizeChat(postId, deviceId, Boolean(payload.claimOwner))
    if (auth.error) {
      socket.emit('chat:error', { postId, error: auth.error })
      return
    }
    socket.join(`chat:${postId}`)
  })

  socket.on('chat:leave', (payload = {}) => {
    const postId = typeof payload.postId === 'string' ? payload.postId : ''
    if (postId) socket.leave(`chat:${postId}`)
  })
})

server.listen(PORT, () => {
  console.log(`Online Disaster Relief API listening on http://localhost:${PORT}`)
})
