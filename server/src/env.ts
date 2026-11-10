import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

// Resolve from this module's location so API startup does not depend on cwd.
const projectEnvPath = fileURLToPath(new URL('../../.env', import.meta.url))
dotenv.config({ path: projectEnvPath, quiet: true })
