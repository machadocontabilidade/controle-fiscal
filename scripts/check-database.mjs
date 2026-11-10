import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { fileURLToPath } from 'node:url'

const envPath = fileURLToPath(new URL('../.env', import.meta.url))
dotenv.config({ path: envPath, quiet: true })

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não está disponível no ambiente nem no .env da raiz do projeto.')
  process.exit(1)
}

const prisma = new PrismaClient()
try {
  await prisma.$queryRaw`SELECT 1`
  console.log('Conexão com o banco estabelecida com sucesso.')
} catch {
  // Do not print Prisma errors: they can contain connection details.
  console.error('Não foi possível conectar ao banco. Detalhes da conexão foram omitidos.')
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
