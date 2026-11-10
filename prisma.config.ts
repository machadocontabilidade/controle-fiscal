import dotenv from 'dotenv'
import { defineConfig, env } from 'prisma/config'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true })

export default defineConfig({
  schema: `${projectRoot}server/prisma/schema.prisma`,
  migrations: { path: `${projectRoot}server/prisma/migrations` },
  datasource: { url: env('DATABASE_URL') },
})
