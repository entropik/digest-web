import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "OOBLIK Digest — Curation",
    description:
      "Capture la page active dans la file éditoriale privée d’OOBLIK Digest.",
    version: "1.1.0",
    minimum_chrome_version: "120",
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
      _execute_action: {
        suggested_key: {
          default: "Ctrl+Shift+D",
          mac: "Command+Shift+D"
        },
        description: "Ouvrir le formulaire de curation"
      }
    }
  }
});
