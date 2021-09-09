const mineflayer = require('mineflayer');
const colorMap = require("./colorMap.json");
const getNearestBlockByColor = require('nearest-color').from(colorMap);
const Jimp = require("jimp");
const mcfsd = require("mcfsd");
const stuffs = require("stuffs");
const chillout = require("chillout");

// CONFIG PART
const offsetX = 0;
const offsetY = 6;
const offsetZ = 0;
const howManyBots = 10;
const perBotOffsetMs = 10;
const placementDelayMs = 10;
const ditheringOffset = 5; // 0 = off, 5 = normal, 10 = little, 2 = much
const scaffoldBlock = "stone";
// CONFIG END

/** @type {mineflayer.Bot[]} */
let bots = [];

for (let i = 0; i < howManyBots; i++) {
  function doTheJob() {
    let bot = mineflayer.createBot({
      username: `ArmaganBot${i + 1}`,
      host: "127.0.0.1",
      keepAlive: true
    });
    bot.spawned = false;
    bot.once("spawn", () => { bot.spawned = true });
    bot.once("end", () => { bot.spawned = false; doTheJob(); });
    bots[i] = bot;
  }
  doTheJob();
}

(async () => {
  let img = await Jimp.read("./image.png");

  // Apply dithering.
  if (ditheringOffset) img = await Jimp.create(await mcfsd(img.bitmap, ditheringOffset));

  /** @type {{x:number,y:number,blockName:string}[]}*/
  let allData = [];

  // Generating data.
  await new Promise((resolve, reject) => {
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, (x, y, idx) => {
      let rgba = stuffs.intToRgba(img.getPixelColor(x, y));
      if (rgba.a == 255) {
        let hexColor = stuffs.rgbToHex(rgba.r, rgba.g, rgba.b);
        let blockName = getNearestBlockByColor(hexColor).name;
        allData.push({ x, y, blockName });
      }
      if (x == img.bitmap.width - 1 && y == img.bitmap.height - 1) {
        resolve();
      }
    })
  });

  allData = allData.filter(i => i?.blockName);

  // Optimize the data.
  /** @type {({type:"setblock",x:number,y:number,blockName:string}|{type:"fill",x1:number,y1:number,x2:number,y2:number,blockName:string})[]}*/
  let optimizedData = [];
  let tmpArr = [];
  let lastY = allData[0].y;
  let lastBlock = allData[0].blockName;
  for (let i = 0; i < allData.length; i++) {
    const el = allData[i];
    if (lastBlock == el.blockName && lastY == el.y) {
      // console.log(el);
      tmpArr.push(el);
      lastBlock = el.blockName;
      lastY = el.y;
    } else {
      if (tmpArr.length) {
        let first = tmpArr[0];
        let last = tmpArr[tmpArr.length - 1];
        optimizedData.push({
          type: "fill",
          x1: first.x,
          y1: first.y,
          x2: last.x,
          y2: last.y,
          blockName: first.blockName
        })
      };
      optimizedData.push({ type: "setblock", ...el});
      tmpArr = [];
      lastBlock = el.blockName;
      lastY = el.y;
    }
  }

  // Remove old data to save some memory
  allData = [];

  // Waiting for bots to get ready.
  await chillout.waitUntil(() => {
    let readyCount = 0;
    bots.forEach((bot) => {
      if (bot.spawned) readyCount++;
    });
    if (readyCount >= howManyBots) return chillout.StopIteration;
  })

  // Chunking data for separate bots.
  /** @type {Array<({type:"setblock",x:number,y:number,blockName:string}|{type:"fill",x1:number,y1:number,x2:number,y2:number,blockName:string})[]>}*/
  let dataChunks = await chunk(optimizedData, Math.ceil(optimizedData.length / howManyBots));

  // Drawing..
  dataChunks.forEach(async (chunk, chunkIndex) => {
    {
      let center = chunk[Math.floor(chunk.length / 2)];
      bots[chunkIndex].chat(`/tp ${offsetX + (center.x ?? center.x1)} ${offsetY + 1} ${offsetZ + (center.y ?? center.y1)}`);
    }
    await stuffs.sleep(perBotOffsetMs * chunkIndex);
    await chillout.forEach(chunk,
      /** @param {({type:"setblock",x:number,y:number,blockName:string}|{type:"fill",x1:number,y1:number,x2:number,y2:number,blockName:string})} data */
      async (data) => {
        await chillout.waitUntil(() => {
          if (bots[chunkIndex]?.spawned) return chillout.StopIteration;
        });
        let bot = bots[chunkIndex];
        switch (data.type) {
          case "setblock": {
            let { blockName, x, y } = data;
            if (isFellableBlock(blockName)) {
              bot.chat(`/setblock ${offsetX + x} ${offsetY - 1} ${offsetZ + y} ${scaffoldBlock}`);
              await stuffs.sleep(placementDelayMs);
            }
            bot.chat(`/setblock ${offsetX + x} ${offsetY} ${offsetZ + y} ${blockName}`);
            break;
          };
          case "fill": {
            let { blockName, x1, y1, x2, y2 } = data;
            if (isFellableBlock(blockName)) {
              bot.chat(`/fill ${offsetX + x1} ${offsetY - 1} ${offsetZ + y1} ${offsetX + x2} ${offsetY - 1} ${offsetZ + y2} ${scaffoldBlock}`);
              await stuffs.sleep(placementDelayMs);
            }
            bot.chat(`/fill ${offsetX + x1} ${offsetY} ${offsetZ + y1} ${offsetX + x2} ${offsetY} ${offsetZ + y2} ${blockName}`);
          }
        }
        await stuffs.sleep(placementDelayMs);
    });
  })
})();

function isFellableBlock(blockName) {
  return blockName.includes("sand") || blockName.includes("powder") || blockName.includes("gravel")
}



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