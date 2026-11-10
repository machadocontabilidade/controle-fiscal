import { Router } from 'express'
import { moduleService } from '../services/moduleService.js'

export const modulesRouter = Router()
modulesRouter.get('/tax/:regime', async (req, res, next) => {
  const name = `tax/${req.params.regime}`
  if (!moduleService.supports(name)) return res.status(404).json({ message: 'Regime tributário não encontrado.' })
  try { res.json(await moduleService.list(name)) } catch (error) { next(error) }
})
modulesRouter.get('/:module', async (req, res, next) => {
  try {
    if (!moduleService.supports(req.params.module)) return res.status(404).json({ message: 'Módulo não encontrado.' })
    res.json(await moduleService.list(req.params.module))
  } catch (error) { next(error) }
})
modulesRouter.get('/:module/:id', async (req, res, next) => {
  try {
    if (!moduleService.supports(req.params.module)) return res.status(404).json({ message: 'Módulo não encontrado.' })
    const record = await moduleService.find(req.params.module, req.params.id)
    return record ? res.json(record) : res.status(404).json({ message: 'Registro não encontrado.' })
  } catch (error) { next(error) }
})
modulesRouter.post('/:module', (req, res) => {
  if (!moduleService.supports(req.params.module)) return res.status(404).json({ message: 'Módulo não encontrado.' })
  res.status(501).json({ message: 'Persistência ainda não habilitada nesta fase.' })
})
modulesRouter.put('/:module/:id', (req, res) => {
  if (!moduleService.supports(req.params.module)) return res.status(404).json({ message: 'Módulo não encontrado.' })
  res.status(501).json({ message: 'Persistência ainda não habilitada nesta fase.' })
})
modulesRouter.delete('/:module/:id', (req, res) => {
  if (!moduleService.supports(req.params.module)) return res.status(404).json({ message: 'Módulo não encontrado.' })
  res.status(501).json({ message: 'Persistência ainda não habilitada nesta fase.' })
})
