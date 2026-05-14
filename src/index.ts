import { execSync } from "child_process";
import * as core from "@actions/core";
import * as fs from "fs";
import * as gh from "@actions/github";
import * as path from "path";

type Octokit = ReturnType<typeof gh.getOctokit>;
type LegacyBundleType = ".tar" | ".tar.gz" | ".tar.br";
type BundleType = LegacyBundleType | ".tar.zst";
type CliVersion = "legacy" | "new";

const detectCli = (rocPath: string): CliVersion => {
  // The legacy compiler prints global help (exit 0) for unknown subcommands, so an exit code alone can't distinguish CLIs.
  // Match on a flag name unique to the new `roc bundle` subcommand.
  try {
    const out = execSync(`${quoteIfSpaces(rocPath)} bundle --help`, {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    return out.includes("--output-dir") ? "new" : "legacy";
  } catch {
    return "legacy";
  }
};

const quoteIfSpaces = (x: string): string => (x.includes(" ") ? `"${x}"` : x);

const bundleLibraryLegacy = (
  rocPath: string,
  libraryEntrypointPath: string,
  bundleType: LegacyBundleType,
  compression: string,
) => {
  if (compression !== "") {
    core.warning("Ignoring 'compression' input on legacy Roc CLI.");
  }
  const bundleCommand = [
    rocPath,
    "build",
    "--bundle",
    bundleType,
    libraryEntrypointPath,
  ]
    .map(quoteIfSpaces)
    .join(" ");
  core.info(`Running bundle command '${bundleCommand}'.`);
  const stdOut = execSync(bundleCommand);
  core.info(stdOut.toString());
};

const bundleLibraryNew = (
  rocPath: string,
  libraryEntrypointPath: string,
  bundleType: BundleType,
  compression: string,
) => {
  if (bundleType !== ".tar.zst") {
    core.warning(
      "Ignoring 'bundle-type' input on new Roc CLI; bundles are always '.tar.zst'.",
    );
  }
  const outputDir = path.dirname(libraryEntrypointPath);
  const bundleCommand = [
    rocPath,
    "bundle",
    "--output-dir",
    outputDir,
    ...(compression !== "" ? ["--compression", compression] : []),
    libraryEntrypointPath,
  ]
    .map(quoteIfSpaces)
    .join(" ");
  core.info(`Running bundle command '${bundleCommand}'.`);
  const stdOut = execSync(bundleCommand);
  core.info(stdOut.toString());
};

const getBundlePath = async (
  libraryEntrypointPath: string,
  extension: BundleType,
): Promise<string> => {
  const libraryFolder = path.dirname(libraryEntrypointPath);
  core.info(
    `Looking for bundled library in '${libraryFolder}' with extension '${extension}'.`,
  );
  const bundleFileName = fs
    .readdirSync(libraryFolder)
    .find((x) => x.endsWith(extension));
  if (bundleFileName === undefined) {
    throw new Error(
      `Couldn't find bundled library in '${libraryFolder}' with extension '${extension}'.`,
    );
  }
  const bundlePath = path.resolve(path.join(libraryFolder, bundleFileName));
  core.info(`Found bundled library at '${bundlePath}'.`);
  return bundlePath;
};

const publishBundledLibrary = async (
  releaseTag: string,
  bundlePath: string,
  octokitClient: Octokit,
) => {
  core.info(`Publishing to release associated with the tag '${releaseTag}'.`);
  const release = await octokitClient.rest.repos
    .getReleaseByTag({
      ...gh.context.repo,
      tag: releaseTag,
    })
    .catch((err: Error) => {
      const createReleaseUrl = `https://github.com/${gh.context.repo.owner}/${gh.context.repo.repo}/releases/new`;
      core.error(
        [
          `Failed to find release associated with the tag '${releaseTag}'.`,
          `You can go to '${createReleaseUrl}' to create a release.`,
        ].join(" "),
      );
      throw err;
    });
  core.info(`Found release '${release.data.name}' at '${release.url}'.`);
  octokitClient.rest.repos
    .uploadReleaseAsset({
      ...gh.context.repo,
      release_id: release.data.id,
      name: path.basename(bundlePath),
      data: fs.createReadStream(bundlePath) as unknown as string,
      headers: {
        "content-length": fs.statSync(bundlePath).size,
        "content-type": "application/octet-stream",
      },
    })
    .catch((err: Error) => {
      core.error(`Failed to upload bundle '${bundlePath}'.`);
      throw err;
    });
};

const main = async () => {
  try {
    // Get inputs
    const isRequired = { required: true };
    const token = core.getInput("token");
    const bundleType = core.getInput("bundle-type") as LegacyBundleType;
    const compression = core.getInput("compression");
    const libraryEntrypointPath = core.getInput("library", isRequired);
    const release = core.getBooleanInput("release", isRequired);
    const releaseTag = core
      .getInput("tag", { required: release })
      .replace(/^refs\/(?:tags|heads)\//, "");
    const rocPath = core.getInput("roc-path", isRequired);
    const octokitClient = gh.getOctokit(token);

    // Detect which Roc CLI we're talking to
    const cli = detectCli(rocPath);
    core.info(`Detected ${cli} Roc CLI.`);

    // Bundle the library
    if (cli === "new") {
      bundleLibraryNew(rocPath, libraryEntrypointPath, bundleType, compression);
    } else {
      bundleLibraryLegacy(
        rocPath,
        libraryEntrypointPath,
        bundleType,
        compression,
      );
    }

    const expectedExtension = cli === "new" ? ".tar.zst" : bundleType;
    const bundlePath = await getBundlePath(
      libraryEntrypointPath,
      expectedExtension,
    );
    core.setOutput("bundle-path", bundlePath);

    // Publish the bundle
    if (release) {
      await publishBundledLibrary(releaseTag, bundlePath, octokitClient);
    } else {
      core.info(
        `The input 'publish' was set to false, so skipping publish step.`,
      );
    }
  } catch (err) {
    core.setFailed((err as Error).message);
  }
};

main();
