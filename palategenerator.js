
const mcAssets = require("minecraft-assets")("1.17.1");
const { getAverageColor } = require("fast-average-color-node");
const Jimp = require("jimp");
const stuffs = require("stuffs");

mcAssets.blocksArray.forEach(async ({ name: blockName }) => {
  if (["bed", "slab", "hook", "head", "gate", "lava", "cauldron", "water", "cob", "web", "string", "door", "lever", "skull", "infested", "sign", "farmland", "book", "jigsaw", "bed", "shulker", "stair", "redstone", "piston", "azalea", "egg", "repeater", "observer", "comparator", "barrier", "end", "plate", "carpet", "coral", "banner", "chest", "detect"].some(i => blockName.includes(i))) return;
  if ((blockName.includes("copper") && !blockName.includes("waxed")) && !blockName.includes("raw")) return;
  if (blockName.includes("snow") && !blockName.includes("block")) return;
  let textureBase64 = mcAssets.textureContent[blockName]?.texture;
  if (!textureBase64) return;
  let img = await Jimp.create(Buffer.from(textureBase64.split(",")[1], "base64"));
  if (await new Promise((resolve, reject) => {
    img.scan(0, 0, img.getWidth(), img.getHeight(), (x, y) => {
      let { a } = stuffs.intToRgba(img.getPixelColor(x, y));
      if (a < 250) return resolve(true)
      if (x == img.bitmap.width - 1 && y == img.bitmap.height - 1) {
        return resolve(false);
      }
    })
  })) return;
  let d = await getAverageColor(textureBase64, {
    mode: "speed",
    algorithm: "sqrt"
  });
  console.log(blockName, d.hex);
})

