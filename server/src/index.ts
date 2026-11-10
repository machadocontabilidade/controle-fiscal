import './env.js'
import express from 'express'
import { companiesRouter } from './routes/companies.js'
import { healthRouter } from './routes/health.js'
import { modulesRouter } from './routes/modules.js'

const app = express()
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173')
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
app.listen(port, () => console.log(`Machado Controle Fiscal API em http://localhost:${port}`))
