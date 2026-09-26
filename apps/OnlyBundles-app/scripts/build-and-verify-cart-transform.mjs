import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = resolve(appRoot, "extensions/bundle-cart-transform-rs");
const wasmPath = resolve(
  extensionRoot,
  "target/wasm32-unknown-unknown/release/bundle_cart_transform_rs.wasm",
);
const maxWasmBytes = 256_000;
const shopifyEnvironment = {
  ...process.env,
  // Shopify CLI skips its interactive self-updater in CI. This process-local
  // value keeps the build gate deterministic without changing developer shells.
  CI: "1",
};

const replayCases = [
  {
    name: "ordinary cart",
    fixture: "tests/fixtures/final-wasm-ordinary-cart.json",
    verify(operations) {
      if (operations.length !== 0) {
        throw new Error("ordinary cart produced an unexpected transform operation");
      }
    },
  },
  {
    name: "valid bundle",
    fixture: "tests/fixtures/final-wasm-valid-bundle.json",
    verify(operations) {
      if (!operations.some((operation) => operation.linesMerge)) {
        throw new Error("valid bundle did not produce a linesMerge operation");
      }
    },
  },
];

function runShopify(args, options = {}) {
  const result = spawnSync("shopify", args, {
    cwd: appRoot,
    env: shopifyEnvironment,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`Shopify CLI exited with status ${result.status ?? "unknown"}`);
  }

  return result;
}

try {
  runShopify(
    ["app", "function", "build", "--path", extensionRoot, "--no-color"],
    { stdio: "inherit", encoding: undefined },
  );

  const wasmBytes = statSync(wasmPath).size;
  if (wasmBytes > maxWasmBytes) {
    throw new Error(
      `final Cart Transform WASM is ${wasmBytes} bytes; limit is ${maxWasmBytes}`,
    );
  }

  for (const replayCase of replayCases) {
    const result = runShopify([
      "app",
      "function",
      "run",
      "--path",
      extensionRoot,
      "--input",
      replayCase.fixture,
      "--export",
      "run",
      "--json",
    ]);
    const execution = JSON.parse(result.stdout);
    const operations = execution.output?.operations;

    if (execution.success !== true || !Array.isArray(operations)) {
      throw new Error(`${replayCase.name} final-WASM execution failed`);
    }

    replayCase.verify(operations);
    console.log(
      `Verified final Cart Transform WASM: ${replayCase.name} (${execution.instructions} instructions)`,
    );
  }

  console.log(`Verified final Cart Transform WASM size: ${statSync(wasmPath).size} bytes`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Cart Transform build gate failed: ${message}`);
  process.exitCode = 1;
}
