import { Script } from "node:vm";

import { adminJs } from "../src/admin-assets.js";

new Script(adminJs, { filename: "admin/app.js" });
process.stdout.write("Admin client syntax is valid.\n");
