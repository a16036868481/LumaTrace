import { register } from "node:module";
import { dirname, resolve } from "node:path";
import { cwd } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const loaderUrl = pathToFileURL(resolve(currentDirectory, "esm-extension-loader.mjs"));

register(loaderUrl, pathToFileURL(`${cwd()}/`));
