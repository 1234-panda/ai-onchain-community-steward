const { spawn } = require("child_process");

const commands = [
  ["npm", ["run", "dev"]],
  ["node", ["scripts/bot.cjs"]]
];

for (const [command, args] of commands) {
  const child = spawn(command, args, { shell: true, stdio: "inherit" });
  child.on("exit", (code) => {
    if (code && code !== 0) process.exitCode = code;
  });
}
