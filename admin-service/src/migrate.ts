import { getMigrations } from "better-auth/db/migration";
import { auth, authDatabase } from "./auth.js";
import { ensureCurationSchema } from "./curation-db.js";

const { runMigrations } = await getMigrations(auth.options);
await runMigrations();
ensureCurationSchema(authDatabase);
console.log("Better Auth and curation databases are ready.");
