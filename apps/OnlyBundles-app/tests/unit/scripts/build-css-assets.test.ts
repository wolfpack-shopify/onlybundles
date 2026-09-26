import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type CssTarget = {
  source: string;
  target: string;
};

function loadCssTargets(): CssTarget[] {
  const moduleUrl = pathToFileURL(
    path.join(process.cwd(), "scripts", "build-css-assets", "targets.js"),
  ).href;
  const script = [
    `import { createTargets } from ${JSON.stringify(moduleUrl)};`,
    "process.stdout.write(JSON.stringify(createTargets(process.cwd())));",
  ].join("\n");

  return JSON.parse(execFileSync(
    process.execPath,
    ["--input-type=module", "--eval", script],
    { cwd: process.cwd(), encoding: "utf8" },
  ));
}

describe("CSS asset builder", () => {
  it("maps owned source CSS to distinct extension assets", () => {
    const targets = loadCssTargets();

    for (const target of targets) {
      expect(path.resolve(target.source)).not.toBe(path.resolve(target.target));
      expect(path.basename(target.target)).not.toBe("modal-discount-bar.css");
    }
  });

  it("resolves local imports without minifying source formatting", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "wpb-css-build-"));
    const importedPath = path.join(directory, "imported.css");
    const sourcePath = path.join(directory, "source.css");
    writeFileSync(importedPath, "/* retained */\n.child {\n  color: red;\n}\n");
    writeFileSync(sourcePath, "@import './imported.css';\n\n.parent {\n  display: block;\n}\n");

    try {
      const moduleUrl = pathToFileURL(
        path.join(process.cwd(), "scripts", "build-css-assets", "css-imports.js"),
      ).href;
      const script = [
        `import { resolveCssImports } from ${JSON.stringify(moduleUrl)};`,
        `process.stdout.write(resolveCssImports(${JSON.stringify(sourcePath)}, ${JSON.stringify(readFileSync(sourcePath, "utf8"))}));`,
      ].join("\n");
      const output = execFileSync(
        process.execPath,
        ["--input-type=module", "--eval", script],
        { cwd: process.cwd(), encoding: "utf8" },
      );

      expect(output).toContain("/* retained */\n.child {\n  color: red;\n}");
      expect(output).toContain(".parent {\n  display: block;\n}");
      expect(output).not.toContain("@import './imported.css'");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
