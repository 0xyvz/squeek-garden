import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const page = (file) => fileURLToPath(new URL(file, import.meta.url));

// Three pages: the garden, the player guide and the Squeek NFT page.
export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: page("index.html"), guide: page("guide.html"), nft: page("nft.html") },
    },
  },
});
