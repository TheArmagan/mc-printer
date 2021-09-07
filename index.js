const mineflayer = require('mineflayer');
const colorMap = require("./colorMap.json");
let getNearestBlock = require('nearest-color').from(colorMap);
const Jimp = require("jimp");
const mcfsd = require("mcfsd");
const stuffs = require("stuffs");
const chillout = require("chillout");

const offsetX = 0;
const offsetY = 10;
const offsetZ = 0;
const howManyBots = 19;
const perBotOffsetMs = 50;
const placementDelayMs = 25;


/** @type {mineflayer.Bot[]} */
let bots = [];

for (let i = 0; i < howManyBots; i++) {
  let bot = mineflayer.createBot({
    username: `ArmaganBot${i + 1}`,
    host: "127.0.0.1"
  });
  bot.spawned = false;
  bot.once("spawn", () => { bot.spawned = true });
  bot.once("kicked", () => { bot.end(); });
  bots.push(bot);
}

(async () => {
  let img = await Jimp.read("./image.png");

  // Apply dithering.
  img = await Jimp.create(await mcfsd(img.bitmap, 5));

  /** @type {{x:number,y:number,blockName:string}[]}*/
  let allData = [];

  // Generating data.
  await new Promise((resolve, reject) => {
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, (x, y, idx) => {
      let rgba = stuffs.intToRgba(img.getPixelColor(x, y));
      if (rgba.a < 250) return;
      let hexColor = stuffs.rgbToHex(rgba.r, rgba.g, rgba.b);
      let blockName = getNearestBlock(hexColor).name;
      allData.push({ x, y, blockName });
      if (x == img.bitmap.width - 1 && y == img.bitmap.height - 1) {
        resolve();
      }
    })
  });

  // Waiting for bots to get ready.
  await chillout.waitUntil(() => {
    let readyCount = 0;
    bots.forEach((bot) => {
      if (bot.spawned) readyCount++;
    });
    if (readyCount >= howManyBots) return chillout.StopIteration;
  })

  // Chunking data for separate bots.
  /** @type {Array<{x:number,y:number,blockName:string}[]>}*/
  let dataChunks = await chunk(allData, Math.ceil(allData.length / howManyBots));

  // Drawing..
  dataChunks.forEach(async (chunk, chunkIndex) => {
    await stuffs.sleep(perBotOffsetMs * chunkIndex);
    await chillout.forEach(chunk, async ({ x, y, blockName }) => {
      if (blockName.includes("sand") || blockName.includes("powder") || blockName.includes("gravel")) {
        bots[chunkIndex].chat(`/setblock ${offsetX + x} ${offsetY - 1} ${offsetZ + y} stone`);
        await stuffs.sleep(placementDelayMs);
      }
      bots[chunkIndex].chat(`/setblock ${offsetX + x} ${offsetY} ${offsetZ + y} ${blockName}`);
      await stuffs.sleep(placementDelayMs);
    });
  })
})();



async function chunk(arr, n) {
  if (!arr || !n) return arr;

  let length = arr.length;
  let slicePoint = 0;
  let result = [];

  await chillout.until(() => {
    if (slicePoint < length) {
      result.push(arr.slice(slicePoint, slicePoint + n))
      slicePoint += n;
    } else {
      return chillout.StopIteration;
    }
  })

  return result;
}