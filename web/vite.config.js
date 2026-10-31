import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const page = (file) => fileURLToPath(new URL(file, import.meta.url));

// Three pages: the garden, the player guide and the Squeek NFT page. The build lands in the repository's dist/ with
// relative paths, so it can be served from any folder or IPFS gateway.
export default defineConfig({
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: { main: page("index.html"), guide: page("guide.html"), nft: page("nft.html") },
    },
  },
});
