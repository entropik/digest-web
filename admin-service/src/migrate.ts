import { getMigrations } from "better-auth/db/migration";
import { auth, authDatabase } from "./auth.js";
import { ensureCurationSchema } from "./curation-db.js";

import { ensureTranslationSchema } from "./translation-store.js";

const { runMigrations } = await getMigrations(auth.options);
await runMigrations();
ensureCurationSchema(authDatabase);
ensureTranslationSchema(authDatabase);
console.log("Better Auth, curation and translation databases are ready.");
