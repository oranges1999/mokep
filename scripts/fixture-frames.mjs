import { topFrame } from "./lib.mjs";
import { frame01 } from "./frames/f01.mjs";
import { frame02 } from "./frames/f02.mjs";
import { frame03 } from "./frames/f03.mjs";
import { frame04 } from "./frames/f04.mjs";
import { frame05 } from "./frames/f05.mjs";
import { frame06 } from "./frames/f06.mjs";
import { frame07 } from "./frames/f07.mjs";
import { frame08 } from "./frames/f08.mjs";
import { frame09 } from "./frames/f09.mjs";

export function frames() {
  const builders = [frame01, frame02, frame03, frame04, frame05, frame06, frame07, frame08, frame09];
  return builders.map((b, i) => topFrame(i, b()));
}
