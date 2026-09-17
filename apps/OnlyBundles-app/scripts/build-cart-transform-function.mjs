import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = resolve(repoRoot, "extensions/bundle-cart-transform-rs");
const wasmPath = resolve(
  extensionRoot,
  "target/wasm32-unknown-unknown/release/bundle_cart_transform_rs.wasm",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: extensionRoot,
    env: process.env,
    stdio: "inherit",
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function resolveWasmSnip() {
  const check = spawnSync("which", ["wasm-snip"], { encoding: "utf8" });
  if (check.status === 0 && check.stdout.trim()) {
    return check.stdout.trim();
  }
  const cargoBin = process.env.CARGO_HOME
    ? resolve(process.env.CARGO_HOME, "bin/wasm-snip")
    : resolve(process.env.HOME || "", ".cargo/bin/wasm-snip");
  if (existsSync(cargoBin)) {
    return cargoBin;
  }
  return "wasm-snip";
}

const rustc = spawnSync("rustup", ["which", "--toolchain", "stable", "rustc"], {
  encoding: "utf8",
});
if (rustc.error) throw rustc.error;
if (rustc.status !== 0) {
  process.stderr.write(rustc.stderr);
  process.exit(rustc.status ?? 1);
}

run(
  "rustup",
  ["run", "stable", "cargo", "build", "--target=wasm32-unknown-unknown", "--release"],
  {
    env: {
      ...process.env,
      RUSTC: rustc.stdout.trim(),
      RUSTFLAGS: "-C strip=none",
    },
  },
);

// Canonical Shopify Functions optimization: remove panicking code with wasm-snip
const wasmSnip = resolveWasmSnip();
run(wasmSnip, ["--snip-rust-panicking-code", wasmPath, "-o", wasmPath]);

console.log(`Compiled and snipped Cart Transform WASM: ${statSync(wasmPath).size} bytes`);
