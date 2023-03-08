import { execSync } from "child_process";
import * as core from "@actions/core";
import * as fs from "fs";
import * as gh from "@actions/github";
import * as path from "path";

const TOKEN = core.getInput("token");
// const AUTH = TOKEN ? `token ${TOKEN}` : undefined;
const BUNDLE_TYPE = core.getInput("bundle-type", { required: true });
const LIBRARY_PATH = core.getInput("library-path", { required: true });
const PUBLISH = core.getBooleanInput("publish", { required: true });
const RELEASE_TAG = core
  .getInput("tag", { required: PUBLISH })
  .replace(/^refs\/(?:tags|heads)/, "");
const ROC_PATH = core.getInput("roc-path", { required: true });
const OCTOKIT_CLIENT = gh.getOctokit(TOKEN);

const bundleLibrary = (rocPath: string, libraryPath: string) => {
  const bundleCommand = [
    rocPath,
    "build",
    "--bundle",
    BUNDLE_TYPE,
    path.join(libraryPath, "main.roc"),
  ]
    .map((x) => (x.includes(" ") ? `"${x}"` : x))
    .join(" ");
  core.info(`Running bundle command '${bundleCommand}'.`);
  const stdOut = execSync(bundleCommand);
  core.info(stdOut.toString());
};

const getBundlePath = async (libraryPath: string): Promise<string> => {
  core.info(
    `Looking for bundled library in '${libraryPath}' with extension '${BUNDLE_TYPE}'.`,
  );
  const bundleFileName = fs
    .readdirSync(libraryPath)
    .find((x) => x.endsWith(BUNDLE_TYPE));
  if (bundleFileName === undefined) {
    throw new Error(
      `Couldn't find bundled library in '${libraryPath}' with extension '${BUNDLE_TYPE}'.`,
    );
  }
  const bundlePath = path.resolve(path.join(libraryPath, bundleFileName));
  core.info(`Found bundled library at '${bundlePath}'.`);
  return bundlePath;
};

// const readBundle = () => {};

const publishBundledLibrary = async (
  releaseTag: string,
  bundlePath: string,
) => {
  core.info(`Publishing to release associated with the tag '${releaseTag}'.`);
  const release = await OCTOKIT_CLIENT.rest.repos
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
  OCTOKIT_CLIENT.rest.repos
    .uploadReleaseAsset({
      ...gh.context.repo,
      release_id: release.data.id,
      name: path.basename(bundlePath),
      data: bundlePath,
    })
    .catch((err: Error) => {
      core.error(`Failed to upload bundle '${bundlePath}'.`);
      throw err;
    });
};

const main = async () => {
  try {
    bundleLibrary(ROC_PATH, LIBRARY_PATH);
    const bundlePath = await getBundlePath(LIBRARY_PATH);
    core.setOutput("bundle-path", bundlePath);
    if (PUBLISH) {
      await publishBundledLibrary(RELEASE_TAG, bundlePath);
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
