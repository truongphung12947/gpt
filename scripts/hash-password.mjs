#!/usr/bin/env node
// Prints one AUTH_USERS entry: node scripts/hash-password.mjs user@example.com
// The password is read from the PASSWORD env var, or prompted (hidden) when run in a terminal.
import { randomBytes, scryptSync } from "node:crypto";
import readline from "node:readline";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email.includes("@")) {
  console.error("usage: [PASSWORD=...] node scripts/hash-password.mjs <email>");
  process.exit(1);
}
let password = process.env.PASSWORD;
if (!password) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  rl._writeToOutput = () => {};
  process.stderr.write("Password: ");
  password = await new Promise((r) => rl.question("", r));
  process.stderr.write("\n");
  rl.close();
}
if (password.length < 10) {
  console.error("password must be at least 10 characters");
  process.exit(1);
}
const salt = randomBytes(16);
console.log(`${email}:${salt.toString("hex")}:${scryptSync(password, salt, 32).toString("hex")}`);
