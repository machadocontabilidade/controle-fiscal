import { Router } from 'express'
export const healthRouter = Router()
healthRouter.get('/', (_req, res) => res.json({
  status: 'ok',
  persistence: 'local-only',
  databaseConfigured: Boolean(process.env.DATABASE_URL),
}))
