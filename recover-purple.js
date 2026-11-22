const fs = require("fs");
const cp = require("child_process");

const path = "style.css";
const backup = "style.css.purple-recovery-backup";

fs.copyFileSync(path, backup);

let css = cp.execFileSync("git", ["show", "HEAD:style.css"])
    .toString("utf8");

const current = fs.readFileSync(path, "utf8");

// Preserve the additional public-profile dark-mode block.
const marker = "PUBLIC PROFILE TABS: DARK MODE VISIBILITY";
const markerIndex = current.indexOf(marker);

if (markerIndex === -1) {
    throw new Error("Could not locate the additional CSS block. Original file was not changed.");
}

const blockStart = current.lastIndexOf("/*", markerIndex);
let extraBlock = current.slice(blockStart);

const blockLines = extraBlock.split(/\r?\n/);

if (blockLines.length < 5) {
    throw new Error("Additional CSS block could not be safely extracted. Original file was not changed.");
}

extraBlock =
    "/* PATRIODX - PUBLIC PROFILE TABS: DARK MODE VISIBILITY */\r\n\r\n" +
    blockLines.slice(4).join("\r\n").replace(/\r?\n$/, "");

const replacements = {
    "#2563eb": "#7c3aed",
    "#1d4ed8": "#6d28d9",
    "#2457a7": "#6d28d9",
    "#3b82f6": "#8b5cf6",
    "#60a5fa": "#a78bfa",
    "#93c5fd": "#c4b5fd",
    "#356df3": "#7c3aed",
    "#6366f1": "#7c3aed",
    "#4f46e5": "#6d28d9",
    "#818cf8": "#a78bfa",
    "#0095f6": "#8b5cf6",
    "#1d9bf0": "#8b5cf6",
    "#eff6ff": "#f5f3ff",
    "#dbeafe": "#ede9fe",
    "#edf4ff": "#f5f3ff",
    "#e8f0ff": "#ede9fe",
    "#bfd5f8": "#ddd6fe",
    "#172554": "#241044",
    "#1e3a8a": "#3b1c70",
    "#93b4ff": "#c4b5fd",
    "#b9d4ff": "#c4b5fd",
    "#233754": "#35205c",
    "#38577e": "#6d28d9",
    "#1e3a5f": "#35205c",
    "#263a59": "#49316b"
};

for (const [oldColor, newColor] of Object.entries(replacements)) {
    css = css.replaceAll(oldColor, newColor);
}

css = css.replace(
    /rgba\(\s*37\s*,\s*99\s*,\s*235\s*,/g,
    "rgba(124, 58, 237,"
);

css = css.replace(
    /rgba\(\s*96\s*,\s*165\s*,\s*250\s*,/g,
    "rgba(167, 139, 250,"
);

css = css.replace(
    /rgba\(\s*29\s*,\s*155\s*,\s*240\s*,\s*0\.10\s*\)/g,
    "rgba(124, 58, 237, 0.10)"
);

// Preserve the original CRLF convention and no-final-newline format.
css = css.replace(/\r\n|\r|\n/g, "\r\n");
extraBlock = extraBlock.replace(/\r\n|\r|\n/g, "\r\n");

css = css.replace(/\r\n$/, "") + "\r\n" + extraBlock;

fs.writeFileSync(path, Buffer.from(css, "utf8"));

console.log("Recovery complete.");
console.log("Backup:", backup);
console.log("Original UTF-8 content restored from Git.");
console.log("Purple replacements reapplied.");
console.log("Blue verification badge colors preserved.");
console.log("Additional public-profile dark-mode CSS preserved.");
