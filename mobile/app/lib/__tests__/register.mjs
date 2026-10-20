// Entry for the node checks in this folder. Registers resolve-hook.mjs so Node 22's built-in type stripping can
// run the app's .ts files directly (no test runner or transpiler to install):
//   node --import ./lib/__tests__/register.mjs lib/__tests__/measurementParser.test.ts
// Nothing in the app imports this file.
import { register } from "node:module";

register("./resolve-hook.mjs", import.meta.url);
