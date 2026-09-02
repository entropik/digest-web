import { defineConfig } from "wxt";

export default defineConfig({
  manifest: ({ browser }) => ({
    name: "OOBLIK Digest — Curation",
    description:
      "Capture la page active dans la file éditoriale privée d’OOBLIK Digest.",
    version: "1.5.2",
    ...(browser === "chrome" ? { minimum_chrome_version: "120" } : {}),
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "curation@digest.ooblik.com",
              strict_min_version: "142.0",
              data_collection_permissions: {
                required: ["browsingActivity", "websiteContent"],
              },
            },
          },
        }
      : {}),
    permissions: ["activeTab", "scripting", "storage"],
    host_permissions: ["https://digest.ooblik.com/*"],
    action: {
      default_title: "Ajouter au Digest",
      default_icon: {
        "16": "icon/16.png",
        "32": "icon/32.png",
        "48": "icon/48.png",
        "128": "icon/128.png"
      }
    },
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "128": "icon/128.png"
    },
    commands: {
      [browser === "firefox" ? "_execute_browser_action" : "_execute_action"]: {
        suggested_key: {
          default: "Ctrl+Shift+Y",
          mac: "Command+Shift+Y"
        },
        description: "Ouvrir le formulaire de curation"
      }
    }
  }),
});
