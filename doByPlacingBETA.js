const mineflayer = require('mineflayer');
const colorMap = require("./colorMap.json");
const getNearestBlockByColor = require('nearest-color').from(colorMap);
const Jimp = require("jimp");
const mcfsd = require("mcfsd");
const stuffs = require("stuffs");
const chillout = require("chillout");
const PathFinder = require("mineflayer-pathfinder");
const MinecraftData = require("minecraft-data");
const MinecraftItem = require('prismarine-item');
const { Vec3 } = require("vec3");

// CONFIG PART
const offsetX = 0;
const offsetY = 4;
const offsetZ = 0;
const placementDelayMs = 5;
const ditheringOffset = 5; // 0 = off, 5 = normal, 10 = little, 2 = much
// CONFIG END

/** @type {mineflayer.Bot} */
let bot;

/** @type {MinecraftData.IndexedData} */
let mcData;

/** @type {typeof MinecraftItem.Item} */
let Item;

{
  bot = mineflayer.createBot({
    username: `ArmaganBot1`,
    host: "127.0.0.1",
    keepAlive: true,
    viewDistance: "far"
  });
  bot.loadPlugin(PathFinder.pathfinder);
  bot.spawned = false;
  bot.once("spawn", () => {
    mcData = MinecraftData(bot.version);
    Item = MinecraftItem(bot.version)
    let botMove = new PathFinder.Movements(bot, mcData);

    botMove.canDig = false;
    botMove.allowParkour = true;
    botMove.allowFreeMotion = true;
    bot.pathfinder.thinkTimeout = 5000;
    

    bot.pathfinder.setMovements(botMove);

    bot.chat("/gamemode creative");

    bot.spawned = true;
  });
  bot.once("kicked", () => { bot.end(); });
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

  // Waiting for bot to get ready.
  await chillout.waitUntil(() => {
    if (bot.spawned) return chillout.StopIteration;
  })

  // Sort teh array to place the best way.
  allData.sort((a, b) => (a.x + a.y) - (b.x + b.y));
  let [allData1, allData2] = await chunk(allData, Math.ceil(allData.length / 2));
  allData1 = await chunkExpanding(allData1);
  allData1 = allData1.reduce((all, current, index) => {
    if (index % 2 == 0) current = current.reverse();
    all.push(...current);
    return all;
  },[])
  allData2 = await chunkExpanding(allData2);
  allData2 = allData2.reduce((all, current, index) => {
    if (index % 2 == 0) current = current.reverse();
    all.push(...current);
    return all;
  }, []);

  let newData = [...allData1, allData2].filter(i=>i?.blockName);
  allData = [];
  allData1 = [];
  allData2 = [];

  // Drawing..
  await chillout.forEach(newData,
    /** @param {{x:number,y:number,blockName:string}} data */
    async (data) => {
      let toPlacePos = new Vec3(offsetX + data.x, offsetY, offsetZ + data.y);
      console.log(data.blockName, "->", mcData.itemsByName[data.blockName]?.id);
      let targetItem = new Item(mcData.itemsByName[data.blockName]?.id || 1, 1);

      if (bot.blockAt(toPlacePos)?.name == data.blockName) return;

      bot._client.write('set_creative_slot', {
        slot: 36,
        item: Item.toNotch(targetItem)
      });
      await stuffs.sleep(50);

      await bot.equip(mcData.itemsByName[data.blockName].id, "hand");

      if (toPlacePos.distanceTo(bot.entity.position) > 2) {
        await bot.pathfinder.goto(new PathFinder.goals.GoalNear(toPlacePos.x, toPlacePos.y+1, toPlacePos.z, 2));
      }
      
      if (!bot.blockAt(toPlacePos).name.includes("air")) await bot.dig(bot.blockAt(toPlacePos));
      
      if (toPlacePos.distanceTo(bot.entity.position) < 1) {
        bot.setControlState("jump", true)
        for (let i = 0; i < 10; i++) {
          await bot._genericPlace(bot.blockAt(toPlacePos), new Vec3(0, -1, 0), {});
          await stuffs.sleep(50);
          if (bot.blockAt(toPlacePos)?.name == data.blockName) break;
        }
        bot.setControlState("jump", false)
      } else {
        await bot._genericPlace(bot.blockAt(toPlacePos), new Vec3(0, -1, 0), {});
      }      

      await stuffs.sleep(placementDelayMs);

    });
})();

async function chunkExpanding(arr) {
  let length = arr.length;
  let slicePoint = 0;
  let result = [];
  let i = 1;
  await chillout.until(() => {

    if (slicePoint < length) {
      result.push(arr.slice(slicePoint, slicePoint + i))
      slicePoint += i;
    } else {
      return chillout.StopIteration;
    }

    i += 1;
  })

  return result;
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