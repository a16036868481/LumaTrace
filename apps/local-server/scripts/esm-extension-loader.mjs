export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    if (
      error?.code === "ERR_MODULE_NOT_FOUND" &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !specifier.match(/\.[cm]?js$/u)
    ) {
      return defaultResolve(`${specifier}.js`, context, defaultResolve);
    }

    throw error;
  }
}
