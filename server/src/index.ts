import './env.js'
import express from 'express'
import { companiesRouter } from './routes/companies.js'
import { healthRouter } from './routes/health.js'
import { modulesRouter } from './routes/modules.js'

const app = express()
const configuredOrigins = (process.env.FRONTEND_ORIGIN ?? 'https://controle-fiscal-ebon.vercel.app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const allowedOrigins = new Set(configuredOrigins)
if (process.env.NODE_ENV !== 'production') allowedOrigins.add('http://localhost:5173')

app.use((req, res, next) => {
  const origin = req.header('Origin')
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ message: 'Origem não autorizada.' })
  }
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin)
    res.header('Vary', 'Origin')
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(express.json({ limit: '10mb' }))
app.use('/api/health', healthRouter)
app.use('/api/companies', companiesRouter)
app.use('/api', modulesRouter)
app.use('/api', (_req, res) => res.status(501).json({ message: 'Módulo preparado para implementação da persistência.' }))
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Avoid logging raw errors, which can include database connection details.
  console.error('Erro interno ao processar a solicitação.')
  res.status(500).json({ message: 'Erro interno ao processar a solicitação.' })
})

const port = Number(process.env.PORT ?? 3333)
app.listen(port, '0.0.0.0', () => console.log(`Machado Controle Fiscal API ouvindo na porta ${port}`))
