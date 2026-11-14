import { app } from "electron";
import fs from "fs";
import path from "path";

const logPath = path.join(app.getPath("userData"), "app.log");

export function log(msg: string) {
  fs.appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
}
