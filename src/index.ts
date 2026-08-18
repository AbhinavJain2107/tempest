import { createCLI } from "./cli/index.js";

const cli = createCLI();
cli.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
