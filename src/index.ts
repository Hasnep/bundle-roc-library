import { execSync } from "child_process";
import * as core from "@actions/core";
import * as fs from "fs";
import * as gh from "@actions/github";
import * as path from "path";

type Octokit = ReturnType<typeof gh.getOctokit>;
type BundleType = ".tar" | ".tar.gz" | ".tar.br";

const bundleLibrary = (
  rocPath: string,
  libraryEntrypointPath: string,
  bundleType: BundleType
) => {
  const bundleCommand = [
    rocPath,
    "build",
    "--bundle",
    bundleType,
    libraryEntrypointPath,
  ]
    .map((x) => (x.includes(" ") ? `"${x}"` : x)) // Add quotes to paths that contain spaces
    .join(" ");
  core.info(`Running bundle command '${bundleCommand}'.`);
  const stdOut = execSync(bundleCommand);
  core.info(stdOut.toString());
};

const getBundlePath = async (
  libraryEntrypointPath: string,
  bundleType: BundleType
): Promise<string> => {
  const libraryFolder = path.dirname(libraryEntrypointPath);
  core.info(
    `Looking for bundled library in '${libraryFolder}' with extension '${bundleType}'.`
  );
  const bundleFileName = fs
    .readdirSync(libraryFolder)
    .find((x) => x.endsWith(bundleType));
  if (bundleFileName === undefined) {
    throw new Error(
      `Couldn't find bundled library in '${libraryFolder}' with extension '${bundleType}'.`
    );
  }
  const bundlePath = path.resolve(path.join(libraryFolder, bundleFileName));
  core.info(`Found bundled library at '${bundlePath}'.`);
  return bundlePath;
};

// const readBundle = () => {};

const publishBundledLibrary = async (
  releaseTag: string,
  bundlePath: string,
  octokitClient: Octokit
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
        ].join(" ")
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
    const bundleType = core.getInput("bundle-type", isRequired) as BundleType;
    const libraryEntrypointPath = core.getInput("library", isRequired);
    const release = core.getBooleanInput("release", isRequired);
    const releaseTag = core
      .getInput("tag", { required: release })
      .replace(/^refs\/(?:tags|heads)\//, "");
    const rocPath = core.getInput("roc-path", isRequired);
    const octokitClient = gh.getOctokit(token);

    // Bundle the library
    bundleLibrary(rocPath, libraryEntrypointPath, bundleType);
    const bundlePath = await getBundlePath(libraryEntrypointPath, bundleType);
    core.setOutput("bundle-path", bundlePath);

    // Publish the bundle
    if (release) {
      await publishBundledLibrary(releaseTag, bundlePath, octokitClient);
    } else {
      core.info(
        `The input 'publish' was set to false, so skipping publish step.`
      );
    }
  } catch (err) {
    core.setFailed((err as Error).message);
  }
};

main();
