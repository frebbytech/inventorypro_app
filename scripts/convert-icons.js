// scripts/convert-icons.js
const sharp = require("sharp");
const path = require("path");

const icons = [
  { input: "assets/logo.png", output: "build/icons/tray-light.png", size: 32 },
  { input: "assets/logo.png", output: "build/icons/tray-dark.png", size: 32 },
];

async function convert() {
  for (const { input, output, size } of icons) {
    await sharp(path.join(__dirname, "..", input))
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, "..", output));
    console.log(`Converted ${input} -> ${output} (${size}x${size})`);
  }
}

convert().catch((err) => {
  console.error(err);
  process.exit(1);
});
