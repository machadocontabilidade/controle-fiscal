import { Router } from 'express'
import { companyService } from '../services/companyService.js'

export const companiesRouter = Router()
companiesRouter.get('/', async (_req, res, next) => { try { res.json(await companyService.list()) } catch (error) { next(error) } })
companiesRouter.get('/:id', async (req, res, next) => { try { const company = await companyService.get(req.params.id); company ? res.json(company) : res.status(404).json({ message: 'Empresa não encontrada.' }) } catch (error) { next(error) } })
// Persistence is deliberately deferred. These routes document the API boundary and return an explicit status.
companiesRouter.post('/', (_req, res) => res.status(501).json({ message: 'Persistência ainda não habilitada nesta fase.' }))
companiesRouter.put('/:id', (_req, res) => res.status(501).json({ message: 'Persistência ainda não habilitada nesta fase.' }))
companiesRouter.delete('/:id', (_req, res) => res.status(501).json({ message: 'Persistência ainda não habilitada nesta fase.' }))
