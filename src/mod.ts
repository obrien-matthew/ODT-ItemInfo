import { DependencyContainer } from "tsyringe";

import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import { IHideoutConfig } from "@spt/models/spt/config/IHideoutConfig";
import { IRagfairConfig } from "@spt/models/spt/config/IRagfairConfig";
import { LogBackgroundColor } from "@spt/models/spt/logging/LogBackgroundColor";
import { LogTextColor } from "@spt/models/spt/logging/LogTextColor";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { ItemBaseClassService } from "@spt/services/ItemBaseClassService";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import {
  HandbookItem,
  IHandbookBase,
} from "@spt/models/eft/common/tables/IHandbookBase";
import { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables";
import { IHideoutProduction } from "@spt/models/eft/hideout/IHideoutProduction";
import { IHideoutArea } from "@spt/models/eft/hideout/IHideoutArea";
import { IQuest } from "@spt/models/eft/common/tables/IQuest";
import { IArmorMaterials } from "@spt/models/eft/common/IGlobals";
import { IBarterScheme, ITrader } from "@spt/models/eft/common/tables/ITrader";
import { Traders } from "@spt/models/enums/Traders";

import config from "../config/config.json";
import tiers from "../config/tiers.json";
import translations from "./translations.json";
import { Item } from "@spt/models/eft/common/tables/IItem";

// Using `this.` is perfectly fine. Much better than having ambiguous and typeless variables declared in some global scope
// Don't worry - there's always opportunities to learn :) - Terkoiz

const newLine = "\n";

class ItemInfo implements IPostDBLoadMod {
  database: DatabaseServer;
  configServer: ConfigServer;
  itemBaseClassService: ItemBaseClassService;
  ragfairConfig: IRagfairConfig;
  hideoutConfig: IHideoutConfig;
  logger: ILogger;
  tables: IDatabaseTables;
  items: Record<string, ITemplateItem>;
  handbook: IHandbookBase;
  locales: Record<string, Record<string, string>>;
  fleaPrices: Record<string, number>;
  hideoutProduction: IHideoutProduction[];
  hideoutAreas: IHideoutArea[];
  quests: Record<string, IQuest>;
  armors: IArmorMaterials;
  traders: Record<string, ITrader>;
  traderList: ITrader[];
  euroRatio: number;
  dollarRatio: number;

  private init(container: DependencyContainer) {
    this.database = container.resolve<DatabaseServer>("DatabaseServer");
    this.configServer = container.resolve<ConfigServer>("ConfigServer");
    this.itemBaseClassService = container.resolve<ItemBaseClassService>(
      "ItemBaseClassService"
    );
    this.ragfairConfig = this.configServer.getConfig<IRagfairConfig>(
      ConfigTypes.RAGFAIR
    );
    this.hideoutConfig = this.configServer.getConfig<IHideoutConfig>(
      ConfigTypes.HIDEOUT
    );

    this.logger.info("[Item Info] Database data is loaded, working...");

    this.tables = this.database.getTables();
    this.items = this.tables.templates.items;
    this.handbook = this.tables.templates.handbook;
    this.locales = this.tables.locales.global;
    this.fleaPrices = this.tables.templates.prices;
    this.hideoutProduction = this.tables.hideout.production;
    this.hideoutAreas = this.tables.hideout.areas;
    this.quests = this.tables.templates.quests;
    this.armors = this.tables.globals.config.ArmorMaterials;
    this.traders = this.tables.traders;

    // Hardcode list for best buy_price_coef
    this.traderList = [
      this.traders[Traders.THERAPIST],
      this.traders[Traders.RAGMAN],
      this.traders[Traders.JAEGER],
      this.traders[Traders.MECHANIC],
      this.traders[Traders.PRAPOR],
      this.traders[Traders.SKIER],
      this.traders[Traders.PEACEKEEPER],
    ];
  }

  public postDBLoad(container: DependencyContainer) {
    this.logger = container.resolve<ILogger>("WinstonLogger");

    // TODO: With order.json being a thing, this can probably be removed and instead instructions for changing load order could be added
    if (config.delay.enabled) {
      this.logger.log(
        `[Item Info] Mod compatibility delay enabled (${config.delay.seconds} seconds), waiting for other mods data to load...`,
        LogTextColor.BLACK,
        LogBackgroundColor.CYAN
      );
      setTimeout(() => {
        this.init(container);
        this.ItemInfoMain();
      }, config.delay.seconds * 1000);
    } else {
      this.init(container);
      this.ItemInfoMain();
    }
  }

  private ItemInfoMain(): void {
    let userLocale = config.UserLocale;

    if (!config.HideLanguageAlert) {
      this.logger.log(
        "[Item Info] This mod supports other languages! \nМод поддерживает другие языки! \nEste mod es compatible con otros idiomas! \nTen mod obsługuje inne języki! \nEnglish, Russian, Spanish, Korean, French, Chinese, Japanese and German are fully translated.\nHide this message in config.json",
        LogTextColor.BLACK,
        LogBackgroundColor.WHITE
      );
      this.logger.log(
        `[Item Info] Your selected language is "${userLocale}". \nYou can now customise it in Item Info config.json file. \nLooking for translators, PM me! \nTranslation debug mode is availiable in translations.json`,
        LogTextColor.BLACK,
        LogBackgroundColor.GREEN
      );
    }

    if (translations.debug.enabled) {
      this.logger.warning(
        `Translation debugging mode enabled! Changing userLocale to ${translations.debug.languageToDebug}`
      );
      userLocale = translations.debug.languageToDebug;
    }

    // Fill the missing translation dictionaries with English keys as a fallback + debug mode to help translations. Smart.
    for (const key in translations["en"]) {
      for (const lang in translations) {
        if (
          translations.debug.enabled &&
          lang != "en" &&
          lang == translations.debug.languageToDebug &&
          translations[translations.debug.languageToDebug][key] ==
            translations["en"][key] &&
          key != ""
        ) {
          this.logger.warning(
            translations.debug.languageToDebug +
              ` language "${
                translations[translations.debug.languageToDebug][key]
              }" is the same as in English`
          );
        }

        if (key in translations[lang] == false) {
          if (
            translations.debug.enabled &&
            translations.debug.languageToDebug == lang
          ) {
            this.logger.warning(
              `${lang} language is missing "${key}" transaition!`
            );
          }

          translations[lang][key] = translations["en"][key];
        }
      }
    }

    // Description generator for .md
    //const descriptionGen = false
    //if (descriptionGen) {
    //	for (const conf in config) {
    //		log("## " + conf)
    //		log("" + config[conf]._description)
    //		log("> " + config[conf]._example)
    //		log(newLine)
    //	}
    //}

    //for (const userLocale in locales){
    // Put main item loop here to make the mod universally international.
    // Insane loading times each time provided for free.
    // In theory, the whole thing can be *slightly* optimised locally, per function with dictionaries, with language arrays for each generated string, etc, but it's a MAJOR refactoring of the whole codebase, and it's not worth the hassle and my sanity.
    // Let the user select their preferred locale in config once, this will save A LOT of time for everybody, that's good enough solution.
    // I'll just pretend I thought about it beforehand and will call it "in hindsight optimization". Cheers.
    // P.S. Is there a way to access last user selected locale at IPreAkiLoadMod?
    //}

    this.euroRatio = this.handbook.Items.find(
      (x) => x.Id == "569668774bdc2da2298b4568"
    ).Price;
    this.dollarRatio = this.handbook.Items.find(
      (x) => x.Id == "5696686a4bdc2da3298b456a"
    ).Price;
    let currencyId = "543be5dd4bdc2deb348b4569";
    let ammoId = "5485a8684bdc2da71d8b4567";
    let ammoBoxId = "543be5cb4bdc2deb348b4568";
    let keyId = "543be5e94bdc2df1348b4568";
    let headwearId = "5a341c4086f77401f2541505";
    let armorId = "5448e54d4bdc2dcc718b4568";
    let vestId = "5448e5284bdc2dcb718b4567";
    let silencerId = "550aa4cd4bdc2dd8348b456c";
    let flashHiderId = "550aa4bf4bdc2dd6348b456b";
    let pistolGripId = "55802f4a4bdc2ddb688b4569";
    let foreGripId = "55818af64bdc2d5b648b4570";
    let bipodId = "55818afb4bdc2dde698b456d";
    let magId = "5448bc234bdc2d3c308b4569";

    let itemPrices = "";

    for (const itemID in this.items) {
      const item = this.items[itemID];
      const itemInHandbook = this.getItemInHandbook(itemID);

      if (
        item._type === "Item" && // Check if the item is a real item and not a "node" type.
        itemInHandbook != undefined && // Ignore "useless" items
        !item._props.QuestItem && // Ignore quest items.
        item._parent != currencyId // Ignore currencies.
      ) {
        const i18n = translations[userLocale];
        // boilerplate defaults
        let descriptionPrefixString = "";
        let descriptionSuffixString = "";
        let priceString = "";
        let barterString = "";
        let productionString = "";
        let usedForBarterString = "";
        let usedForQuestsString = "";
        let usedForHideoutString = "";
        let usedForCraftingString = "";
        let armorDurabilityString = "";
        let spawnChanceString = "";
        let slotefficiencyString = "";
        let headsetDescription = "";
        let tier = "";
        let spawnString = "";
        let weightDenominator = 1;
        let itemTraderValuePerSlotPerKg = 1;
        let itemTraderValuePerSlotPerKgNorm = 1;
        let itemFleaValuePerSlotPerKg = 1;
        let itemFleaValuePerSlotPerKgNorm = 1;
        let weightMinThreshold = 0.025;
        let isKey = this.items[item._parent]._parent == keyId;
        let isAmmo = this.items[item._parent]._id == ammoId;
        let isAmmoBox = this.items[item._parent]._id == ammoBoxId;
        let isHeadwear = this.items[item._parent]._id == headwearId;
        let isArmor = this.items[item._parent]._id == armorId;
        let isVest = this.items[item._parent]._id == vestId;
        let isSilencer = this.items[item._parent]._id == silencerId;
        let isFlashHider = this.items[item._parent]._id == flashHiderId;
        let isPistolGrip = this.items[item._parent]._id == pistolGripId;
        let isForeGrip = this.items[item._parent]._id == foreGripId;
        let isBipod = this.items[item._parent]._id == bipodId;
        let isMag = this.items[item._parent]._id == magId;

        let fleaPrice = Math.round(this.getFleaPrice(itemID));
        const itemBestVendor = this.getItemBestTrader(itemID, userLocale);
        let traderPrice = Math.round(itemBestVendor.price);
        const traderName = itemBestVendor.name;

        const itemSlots = item._props.Width * item._props.Height;

        // if (!isAmmo && !isKey) {
        // 	// var dict = {
        // 	// 	id : item._id,
        // 	// 	trader : traderPrice,
        // 	// 	flea : fleaPrice
        // 	// }
        // 	// itemPrices.push(dict)
        // 	itemPrices += `${item._id},${item._props.Name},${traderPrice},${fleaPrice},${item._props.Weight},${itemSlots},${item._props.StackMaxSize}\n`
        // }

        let spawnChance = 10; // DEGUG

        const slotDensity = this.getItemSlotDensity(itemID);

        const itemBarters = this.bartersResolver(itemID);
        const barterInfo = this.barterInfoGenerator(itemBarters, userLocale);
        const barterResourceInfo = this.barterResourceInfoGenerator(
          itemID,
          userLocale
        );
        const rarityArray = [];
        rarityArray.push(barterInfo.rarity); // futureprofing, add other rarity calculations

        // if (item._parent == "543be5cb4bdc2deb348b4568") {
        // 	// Ammo boxes special case
        // 	const count = item._props.StackSlots[0]._max_count
        // 	const ammo = item._props.StackSlots[0]._props.filters[0].Filter[0]

        // 	const value = this.getItemBestTrader(ammo).price
        // 	traderPrice = value * count
        // }

        // Calculate value per slot of a max stack
        let itemTraderValuePerSlot = traderPrice; // itemInHandbook.Price
        let itemFleaValuePerSlot = fleaPrice;
        if (item._props.StackMaxSize > 1) {
          itemTraderValuePerSlot =
            itemTraderValuePerSlot * item._props.StackMaxSize;
          itemFleaValuePerSlot =
            itemFleaValuePerSlot * item._props.StackMaxSize;
        }
        if (itemSlots > 1) {
          itemTraderValuePerSlot = itemTraderValuePerSlot / itemSlots;
          itemFleaValuePerSlot = itemFleaValuePerSlot / itemSlots;
        }

        weightDenominator =
          Math.max(item._props.Weight, 0.001) * item._props.StackMaxSize;
        itemTraderValuePerSlotPerKg = Math.round(
          itemTraderValuePerSlot / weightDenominator
        );
        itemFleaValuePerSlotPerKg = Math.round(
          itemFleaValuePerSlot / weightDenominator
        );

        // if (item._props.Weight < weightMinThreshold) {
        // 	weightDenominator = weightMinThreshold * item._props.StackMaxSize
        // 	itemTraderValuePerSlotPerKgNorm = Math.round(itemTraderValuePerSlot / weightDenominator)
        // 	itemFleaValuePerSlotPerKgNorm = Math.round(itemFleaValuePerSlot / weightDenominator)
        // } else {
        // 	itemTraderValuePerSlotPerKgNorm = itemTraderValuePerSlotPerKg
        // 	itemFleaValuePerSlotPerKgNorm = itemFleaValuePerSlotPerKg
        // }

        itemTraderValuePerSlot = Math.round(itemTraderValuePerSlot);
        itemFleaValuePerSlot = Math.round(itemFleaValuePerSlot);

        // Ammo boxes special case
        // if (item._parent == "543be5cb4bdc2deb348b4568") {
        // 	const count = item._props.StackSlots[0]._max_count
        // 	const ammo = item._props.StackSlots[0]._props.filters[0].Filter[0]
        // 	const value = this.getItemInHandbook(ammo).Price
        // 	itemTraderValuePerSlot = value * count
        // }

        var priceMetric;
        // Update key names and colors
        if (isKey) {
          priceMetric = fleaPrice;
          // background color
          if (priceMetric > tiers.priceThresholds.key[0]) {
            item._props.BackgroundColor = tiers.backgroundColors[0];
            this.addToName(itemID, ` {${tiers.nameCodes[0]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[0]}}`, "append");
          } else if (priceMetric > tiers.priceThresholds.key[1]) {
            item._props.BackgroundColor = tiers.backgroundColors[1];
            this.addToName(itemID, ` {${tiers.nameCodes[1]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[1]}}`, "append");
          } else if (priceMetric > tiers.priceThresholds.key[2]) {
            item._props.BackgroundColor = tiers.backgroundColors[2];
            this.addToName(itemID, ` {${tiers.nameCodes[2]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[2]}}`, "append");
          } else if (priceMetric > tiers.priceThresholds.key[3]) {
            item._props.BackgroundColor = tiers.backgroundColors[3];
            this.addToName(itemID, ` {${tiers.nameCodes[3]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[3]}}`, "append");
          } else if (priceMetric > tiers.priceThresholds.key[4]) {
            item._props.BackgroundColor = tiers.backgroundColors[4];
            this.addToName(itemID, ` {${tiers.nameCodes[4]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[4]}}`, "append");
          } else if (priceMetric > tiers.priceThresholds.key[5]) {
            item._props.BackgroundColor = tiers.backgroundColors[5];
          } else {
            item._props.BackgroundColor = tiers.backgroundColors[6];
          }

          // key labeling
          if (keys.multiMap.includes(itemID)) {
            // this.addToName(itemID, " (Multi)", "append")
            this.addToName(itemID, "[M] ", "prepend");
            this.addToShortName(itemID, "[M] ", "prepend");
          } else if (keys.customs.includes(itemID)) {
            // this.addToName(itemID, " (Customs)", "append")
            this.addToName(itemID, "[C] ", "prepend");
            this.addToShortName(itemID, "[C] ", "prepend");
          } else if (keys.factory.includes(itemID)) {
            // this.addToName(itemID, " (Factory)", "append")
            this.addToName(itemID, "[F] ", "prepend");
            this.addToShortName(itemID, "[F] ", "prepend");
          } else if (keys.reserve.includes(itemID)) {
            // this.addToName(itemID, " (Reserve)", "append")
            this.addToName(itemID, "[R] ", "prepend");
            this.addToShortName(itemID, "[R] ", "prepend");
          } else if (keys.groundzero.includes(itemID)) {
            // this.addToName(itemID, " (Ground Zero)", "append")
            this.addToName(itemID, "[GZ] ", "prepend");
            this.addToShortName(itemID, "[GZ] ", "prepend");
          } else if (keys.lighthouse.includes(itemID)) {
            // this.addToName(itemID, " (Lighthouse)", "append")
            this.addToName(itemID, "[LH] ", "prepend");
            this.addToShortName(itemID, "[LH] ", "prepend");
          } else if (keys.shoreline.includes(itemID)) {
            // this.addToName(itemID, " (Shoreline)", "append")
            this.addToName(itemID, "[Sh] ", "prepend");
            this.addToShortName(itemID, "[Sh] ", "prepend");
          } else if (keys.interchange.includes(itemID)) {
            // this.addToName(itemID, " (Interchange)", "append")
            this.addToName(itemID, "[I] ", "prepend");
            this.addToShortName(itemID, "[I] ", "prepend");
          } else if (keys.streets.includes(itemID)) {
            // this.addToName(itemID, " (Streets)", "append")
            this.addToName(itemID, "[St] ", "prepend");
            this.addToShortName(itemID, "[St] ", "prepend");
          } else if (keys.woods.includes(itemID)) {
            // this.addToName(itemID, " (Woods)", "append")
            this.addToName(itemID, "[W] ", "prepend");
            this.addToShortName(itemID, "[W] ", "prepend");
          } else if (keys.labs.includes(itemID)) {
            // this.addToName(itemID, " (Labs)", "append")
            this.addToName(itemID, "[L] ", "prepend");
            this.addToShortName(itemID, "[L] ", "prepend");
          } else if (keys.useless.includes(itemID)) {
            // this.addToName(itemID, " (Useless)", "append")
            this.addToName(itemID, "[U] ", "prepend");
            this.addToShortName(itemID, "[U] ", "prepend");
          } else {
            // this.addToName(itemID, " (Unknown)", "append")
            this.addToName(itemID, "[UNK] ", "prepend");
            this.addToShortName(itemID, "[UNK] ", "prepend");
          }
        } else if (isAmmo || isAmmoBox) {
          let pen = 0;
          if (isAmmo) {
            pen = item._props.PenetrationPower;
            if (config.BulletStatsInName.enabled) {
              let damageMult = 1;
              if (item._props.ammoType === "buckshot") {
                damageMult = item._props.buckshotBullets;
              }
              this.addToName(
                itemID,
                ` (${item._props.Damage * damageMult}/${pen})`,
                "append"
              );
            }
          } else {
            const ammo = this.items[
              item._props.StackSlots[0]._props.filters[0].Filter[0]
            ];
            pen = ammo._props.PenetrationPower;
            if (config.BulletStatsInName.enabled) {
              let damageMult = 1;
              if (ammo._props.ammoType === "buckshot") {
                damageMult = ammo._props.buckshotBullets;
              }
              this.addToName(
                itemID,
                ` (${ammo._props.Damage * damageMult}/${pen})`,
                "append"
              );
            }
          }
          if (pen >= 60) {
            item._props.BackgroundColor = tiers.backgroundColors[0];
            this.addToName(itemID, ` {${tiers.nameCodes[0]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[0]}}`, "append");
          } else if (pen >= 50) {
            item._props.BackgroundColor = tiers.backgroundColors[1];
            this.addToName(itemID, ` {${tiers.nameCodes[1]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[1]}}`, "append");
          } else if (pen >= 40) {
            item._props.BackgroundColor = tiers.backgroundColors[2];
            this.addToName(itemID, ` {${tiers.nameCodes[2]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[2]}}`, "append");
          } else if (pen >= 30) {
            item._props.BackgroundColor = tiers.backgroundColors[3];
            this.addToName(itemID, ` {${tiers.nameCodes[3]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[3]}}`, "append");
          } else if (pen >= 20) {
            item._props.BackgroundColor = tiers.backgroundColors[4];
            this.addToName(itemID, ` {${tiers.nameCodes[4]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[4]}}`, "append");
          } else if (pen >= 10) {
            item._props.BackgroundColor = tiers.backgroundColors[5];
            this.addToName(itemID, ` {${tiers.nameCodes[5]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[5]}}`, "append");
          } else {
            item._props.BackgroundColor = tiers.backgroundColors[6];
            this.addToName(itemID, ` {${tiers.nameCodes[6]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[6]}}`, "append");
          }
        } else {
          // ALL OTHER ITEMS
          priceMetric = itemFleaValuePerSlot;
          if (priceMetric > tiers.priceThresholds.itemPerSlot[0]) {
            item._props.BackgroundColor = tiers.backgroundColors[0];
            this.addToName(itemID, ` {${tiers.nameCodes[0]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[0]}}`, "append");
          } else if (priceMetric > tiers.priceThresholds.itemPerSlot[1]) {
            item._props.BackgroundColor = tiers.backgroundColors[1];
            this.addToName(itemID, ` {${tiers.nameCodes[1]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[1]}}`, "append");
          } else if (priceMetric > tiers.priceThresholds.itemPerSlot[2]) {
            item._props.BackgroundColor = tiers.backgroundColors[2];
            this.addToName(itemID, ` {${tiers.nameCodes[2]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[2]}}`, "append");
          } else if (priceMetric > tiers.priceThresholds.itemPerSlot[3]) {
            item._props.BackgroundColor = tiers.backgroundColors[3];
            this.addToName(itemID, ` {${tiers.nameCodes[3]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[3]}}`, "append");
          } else if (priceMetric > tiers.priceThresholds.itemPerSlot[4]) {
            item._props.BackgroundColor = tiers.backgroundColors[4];
            this.addToName(itemID, ` {${tiers.nameCodes[4]}}`, "append");
            this.addToShortName(itemID, ` {${tiers.nameCodes[4]}}`, "append");
          } else if (priceMetric > tiers.priceThresholds.itemPerSlot[5]) {
            item._props.BackgroundColor = tiers.backgroundColors[5];
          } else {
            item._props.BackgroundColor = tiers.backgroundColors[6];
          }
        }

        // if (item._parent == "5485a8684bdc2da71d8b4567"){
        // 	log(`${item._props.Name} / ${item._props.BackgroundColor} / ${itemTraderValuePerSlot}`)
        // }

        // add container size info to containers
        if (config.ContainerInfo.enabled) {
          if (item._props.Grids?.length > 0) {
            let totalSlots = 0;
            for (const grid of item._props.Grids) {
              totalSlots += grid._props.cellsH * grid._props.cellsV;
            }
            let containerSize = "XS";
            if (totalSlots >= 50) {
              containerSize = "XL";
            } else if (totalSlots >= 30) {
              containerSize = "L";
            } else if (totalSlots >= 15) {
              containerSize = "M";
            } else if (totalSlots >= 8) {
              containerSize = "S";
            }
            const slotefficiency = roundWithPrecision(
              totalSlots / (item._props.Width * item._props.Height),
              2
            );
            slotefficiencyString +=
              `${i18n.Slotefficiency}: ×${slotefficiency} (${totalSlots}/${
                item._props.Width * item._props.Height
              })` +
              newLine +
              newLine;
            this.addToName(itemID, `[${containerSize}] `, "prepend");
            this.addToName(
              itemID,
              ` [${totalSlots}, x${slotefficiency}]`,
              "append"
            );
            this.addToShortName(
              itemID,
              `[${containerSize}, ${totalSlots}, x${slotefficiency}] `,
              "prepend"
            );
          }
        }

        // add armor info to armor items
        if (config.ArmorInfo.enabled) {
          if (item._props.armorClass > 0) {
            const armor = this.armors[item._props.ArmorMaterial];
            let effectiveDur = Math.round(
              item._props?.MaxDurability / armor?.Destructibility
            );
            armorDurabilityString +=
              `${
                config.ArmorInfo.addArmorClassInfo
                  ? i18n.Armorclass + ": " + item._props?.armorClass + " | "
                  : ""
              }${i18n.Effectivedurability}: ${effectiveDur} (${
                i18n.Max
              }: ${Math.round(item._props?.MaxDurability)} x ${
                this.locales[userLocale][`Mat${item._props?.ArmorMaterial}`]
              }: ${roundWithPrecision(1 / armor?.Destructibility, 1)}) | ${
                i18n.Repairdegradation
              }: ${Math.round(
                armor?.MinRepairDegradation * 100
              )}% - ${Math.round(armor?.MaxRepairDegradation * 100)}%` +
              newLine +
              newLine;
            this.addToName(
              itemID,
              `[L${item._props?.armorClass}: ${effectiveDur}] `,
              "prepend"
            );
            this.addToName(
              itemID,
              ` (${item._props?.ArmorMaterial})`,
              "append"
            );
            this.addToShortName(
              itemID,
              `[L${item._props?.armorClass}: ${effectiveDur}] `,
              "prepend"
            );
          }
        }

        // add armor info to headwear, vests, and plate carriers
        if (isHeadwear || isArmor || isVest) {
          let armorClass = "";
          let armorMat = "";
          let effectiveDur = "";
          let frontPlate = "";
          let sidePlate = "";
          for (let i = 0; i < item._props.Slots.length; i++) {
            let mod = item._props.Slots[i];
            if (
              (mod._name == "Helmet_top" && isHeadwear) ||
              (mod._name == "Soft_armor_front" && (isArmor || isVest))
            ) {
              const topMaterial = this.items[mod._props.filters[0].Plate];
              const armor = this.armors[topMaterial._props.ArmorMaterial];
              armorMat = topMaterial._props?.ArmorMaterial;
              effectiveDur = `: ${Math.round(
                topMaterial._props?.MaxDurability / armor?.Destructibility
              )}`;
              armorClass = `L${topMaterial._props.armorClass}`;
            } else if ((isArmor || isVest) && mod._name == "Front_plate") {
              frontPlate = "+";
            } else if ((isArmor || isVest) && mod._name == "Right_side_plate") {
              sidePlate += "+";
            }
          }
          let armorInfo = armorClass + frontPlate + sidePlate + effectiveDur;
          if (armorInfo != "") {
            this.addToName(itemID, `[${armorInfo}] `, "prepend");
            this.addToName(itemID, ` [${armorMat}]`, "append");
            this.addToShortName(itemID, `[${armorInfo}] `, "prepend");
          }
        }

        // add silencer info
        if (isSilencer) {
          let attachmentInfo = `L: ${item._props.Loudness}|E: ${item._props.Ergonomics}|R: ${item._props.Recoil}`;
          this.addToName(itemID, `[${attachmentInfo}] `, "prepend");
          this.addToShortName(itemID, `[${attachmentInfo}] `, "prepend");
        }

        // add flash hider / muzzle break info
        if (isFlashHider) {
          let attachmentInfo = `R: ${item._props.Recoil}|E: ${item._props.Ergonomics}|A: ${item._props.Accuracy}`;
          this.addToName(itemID, `[${attachmentInfo}] `, "prepend");
          this.addToShortName(itemID, `[${attachmentInfo}] `, "prepend");
        }

        if (isPistolGrip || isMag) {
          let attachmentInfo = `E: ${item._props.Ergonomics}`;
          this.addToName(itemID, `[${attachmentInfo}] `, "prepend");
          this.addToShortName(itemID, `[${attachmentInfo}] `, "prepend");
        }

        if (isForeGrip || isBipod) {
          let attachmentInfo = `E: ${item._props.Ergonomics}|R: ${item._props.Recoil}`;
          this.addToName(itemID, `[${attachmentInfo}] `, "prepend");
          this.addToShortName(itemID, `[${attachmentInfo}] `, "prepend");
        }

        if (config.PricesInfo.enabled) {
          // if (config.RarityRecolor.addTierNameToPricesInfo) {
          // 	if (tier.length > 0) {
          // 		priceString += tier + " | "
          // 	}
          // }
          priceString +=
            config.PricesInfo.addFleaPrice && fleaPrice > 0
              ? this.formatPrice(fleaPrice) +
                " ₽ [" +
                this.formatPrice(itemFleaValuePerSlot) +
                " ₽/s] {" +
                this.formatPrice(itemFleaValuePerSlotPerKg) +
                " ₽/s/kg} (Flea)" +
                newLine
              : "";
          priceString +=
            this.formatPrice(traderPrice) +
            " ₽ [" +
            this.formatPrice(itemTraderValuePerSlot) +
            " ₽/s] {" +
            this.formatPrice(itemTraderValuePerSlotPerKg) +
            " ₽/s/kg} (" +
            traderName +
            ")" +
            newLine;
          priceString += newLine;
        }

        if (config.HeadsetInfo.enabled) {
          if (item._props.Distortion !== undefined) {
            const gain = item._props.CompressorGain;
            const thresh = item._props.CompressorTreshold;
            headsetDescription =
              `${i18n.AmbientVolume}: ${item._props.AmbientVolume}dB | ${
                i18n.Compressor
              }: ${i18n.Gain} +${gain}dB × ${
                i18n.Treshold
              } ${thresh}dB ≈ ×${Math.abs((gain * thresh) / 100)} ${
                i18n.Boost
              } | ${i18n.ResonanceFilter}: ${item._props.Resonance}@${
                item._props.CutoffFreq
              }Hz | ${i18n.Distortion}: ${Math.round(
                item._props.Distortion * 100
              )}%` +
              newLine +
              newLine;
          }
        }

        if (config.BarterInfo.enabled) {
          if (barterInfo.barters.length > 1) {
            barterString =
              "BARTER FOR" +
              newLine +
              "---------" +
              newLine +
              barterInfo.barters +
              newLine;
          }
        }

        if (config.BarterResourceInfo.enabled) {
          if (barterResourceInfo.length > 1) {
            usedForBarterString =
              "BARTER WITH" +
              newLine +
              "---------" +
              newLine +
              barterResourceInfo +
              newLine;
          }
        }

        if (config.ProductionInfo.enabled) {
          const productionInfo = this.productionGenarator(itemID, userLocale);
          if (productionInfo.length > 1) {
            productionString =
              "PRODUCTION" +
              newLine +
              "---------" +
              newLine +
              productionInfo +
              newLine;
          }
        }

        if (config.QuestInfo.enabled) {
          const itemQuestInfo = this.QuestInfoGenerator(itemID, userLocale);
          if (itemQuestInfo.length > 1) {
            usedForQuestsString =
              "QUESTS" +
              newLine +
              "---------" +
              newLine +
              itemQuestInfo +
              newLine;
            if (config.QuestInfo.FIRinName && itemQuestInfo.includes("✔")) {
              this.addToName(itemID, "✔", "append");
            }
          }
        }

        if (config.HideoutInfo.enabled) {
          const itemHideoutInfo = this.HideoutInfoGenerator(itemID, userLocale);
          if (itemHideoutInfo.length > 1) {
            usedForHideoutString =
              "HIDEOUT" +
              newLine +
              "---------" +
              newLine +
              itemHideoutInfo +
              newLine;
          }
        }

        if (config.CraftingMaterialInfo.enabled) {
          const itemCraftingMaterialInfo = this.CraftingMaterialInfoGenarator(
            itemID,
            userLocale
          );
          if (itemCraftingMaterialInfo.length > 1) {
            usedForCraftingString =
              "CRAFTING" +
              newLine +
              "---------" +
              newLine +
              itemCraftingMaterialInfo +
              newLine;
          }
        }

        descriptionPrefixString = priceString;

        this.addToDescription(itemID, descriptionPrefixString, "prepend");

        descriptionSuffixString =
          newLine +
          newLine +
          spawnString +
          spawnChanceString +
          headsetDescription +
          armorDurabilityString +
          slotefficiencyString +
          usedForQuestsString +
          usedForHideoutString +
          barterString +
          productionString +
          usedForCraftingString +
          usedForBarterString;

        this.addToDescription(itemID, descriptionSuffixString, "append");

        const debug = false;
        if (debug) {
          log(this.getItemName(itemID, userLocale));
          log(descriptionSuffixString);
          log("---");
        }
      }
    }
    // writeFileSync("itemPrices.csv", itemPrices)
    this.logger.success("[Item Info] Finished processing items, enjoy!");
    if (translations.debug.enabled) {
      const debugItemIDlist = [
        "590a3efd86f77437d351a25b",
        "5c0e722886f7740458316a57",
        "5645bcc04bdc2d363b8b4572",
        "590c621186f774138d11ea29",
        "59faff1d86f7746c51718c9c",
        "5c0e625a86f7742d77340f62",
        "5bb20dcad4351e3bac1212da",
      ];
      for (const debugItemID of debugItemIDlist) {
        this.logger.info("---");
        this.logger.info(newLine);
        this.logger.info(debugItemID);
        this.logger.info(
          this.getItemName(debugItemID, translations.debug.languageToDebug)
        );
        this.logger.info(newLine);
        this.logger.info(
          this.getItemShortName(debugItemID, translations.debug.languageToDebug)
        );
        this.logger.info(newLine);
        this.logger.info(
          this.getItemDescription(
            debugItemID,
            translations.debug.languageToDebug
          )
        );
      }
    }
  }

  getItemName(itemID: string, locale = "en"): string {
    if (typeof this.locales[locale][`${itemID} Name`] != "undefined") {
      return this.locales[locale][`${itemID} Name`];
    } else if (typeof this.locales["en"][`${itemID} Name`] != "undefined") {
      return this.locales["en"][`${itemID} Name`];
    } else if (typeof this.items[itemID]?._props?.Name != "undefined") {
      return this.items[itemID]._props.Name; // If THIS fails, the modmaker REALLY fucked up
    } else {
      return;
    }
  }

  getItemShortName(itemID: string, locale = "en"): string {
    if (typeof this.locales[locale][`${itemID} ShortName`] != "undefined") {
      return this.locales[locale][`${itemID} ShortName`];
    } else if (
      typeof this.locales["en"][`${itemID} ShortName`] != "undefined"
    ) {
      return this.locales["en"][`${itemID} ShortName`];
    } else {
      return this.items[itemID]._props.ShortName;
    }
  }

  getItemDescription(itemID: string, locale = "en"): string {
    if (typeof this.locales[locale][`${itemID} Description`] != "undefined") {
      return this.locales[locale][`${itemID} Description`];
    } else if (
      typeof this.locales["en"][`${itemID} Description`] != "undefined"
    ) {
      return this.locales["en"][`${itemID} Description`];
    } else {
      return this.items[itemID]._props.Description;
    }
  }

  formatPrice(price: number): string {
    if (typeof price == "number" && config.FormatPrice) {
      return Intl.NumberFormat("en-US").format(price);
    } else {
      return price.toString();
    }
  }

  addToName(
    itemID: string,
    addToName: string,
    place: "prepend" | "append",
    lang = ""
  ): void {
    if (lang == "") {
      // I'm actually really proud of this one! If no lang argument is passed, it defaults to recursion for all languages.
      for (const locale in this.locales) {
        this.addToName(itemID, addToName, place, locale);
      }
    } else {
      const originalName = this.getItemName(itemID, lang);
      switch (place) {
        case "prepend":
          this.locales[lang][`${itemID} Name`] = addToName + originalName;
          break;
        case "append":
          this.locales[lang][`${itemID} Name`] = originalName + addToName;
          break;
      }
    }
  }

  addToShortName(
    itemID: string,
    addToShortName: string,
    place: "prepend" | "append",
    lang = ""
  ): void {
    if (lang == "") {
      for (const locale in this.locales) {
        this.addToShortName(itemID, addToShortName, place, locale);
      }
    } else {
      const originalShortName = this.getItemShortName(itemID, lang);
      switch (place) {
        case "prepend":
          this.locales[lang][`${itemID} ShortName`] =
            addToShortName + originalShortName;
          break;
        case "append":
          this.locales[lang][`${itemID} ShortName`] =
            originalShortName + addToShortName;
          break;
      }
    }
  }

  addToDescription(
    itemID: string,
    addToDescription: string,
    place: "prepend" | "append",
    lang = ""
  ): void {
    if (lang == "") {
      for (const locale in this.locales) {
        this.addToDescription(itemID, addToDescription, place, locale);
      }
    } else {
      const originalDescription = this.getItemDescription(itemID, lang);
      switch (place) {
        case "prepend":
          this.locales[lang][`${itemID} Description`] =
            addToDescription + originalDescription;
          break;
        case "append":
          this.locales[lang][`${itemID} Description`] =
            originalDescription + addToDescription;
          break;
      }
    }
  }

  getItemSlotDensity(itemID: string): number {
    return (
      (this.items[itemID]._props.Width * this.items[itemID]._props.Height) /
      this.items[itemID]._props.StackMaxSize
    );
  }

  getItemInHandbook(itemID: string): HandbookItem {
    try {
      return this.handbook.Items.find((i) => i.Id === itemID); // Outs: @Id, @ParentId, @Price
    } catch (error) {
      log(error);
    }
  }

  resolveBestTrader(itemID: string, locale = "en") {
    let traderMulti = 0; // AVG fallback
    let traderName = "None";
    // let itemParentID = this.items[itemID]._parent // Unused
    const itemBaseClasses = this.itemBaseClassService.getItemBaseClasses(
      itemID
    );
    // log(itemBaseClasses)
    // let handbookCategories = handbook.Categories.filter((i) => i.Id === handbookParentId)[0]

    // traderSellCategory = handbookCategories?.Id // "?" check is for shitty custom items
    // altTraderSellCategory = handbookCategories?.ParentId

    for (const trader of this.traderList) {
      if (
        (trader.base.items_buy.category.some((x) =>
          itemBaseClasses.includes(x)
        ) ||
          trader.base.items_buy.id_list.includes(itemID)) &&
        !trader.base.items_buy_prohibited.id_list.includes(itemID)
      ) {
        // items_buy is new to 350 it seems
        traderMulti = (100 - trader.base.loyaltyLevels[0].buy_price_coef) / 100;
        //traderName = traderList[i].base.nickname
        traderName = this.locales[locale][`${trader.base._id} Nickname`];
        // log(`${this.getItemName(itemID)} @ ${traderName}`)
        return {
          multi: traderMulti,
          name: traderName,
        };
      }
    }

    return {
      multi: traderMulti,
      name: traderName,
    };
  }

  getItemBestTrader(itemID: string, locale = "en") {
    const handbookItem = this.getItemInHandbook(itemID);

    // log(handbookItem)
    const bestTrader = this.resolveBestTrader(itemID, locale);
    const result = handbookItem.Price * bestTrader.multi;
    return {
      price: result,
      name: bestTrader.name,
      ParentId: handbookItem.ParentId,
    };
  }

  getFleaPrice(itemID: string): number {
    if (typeof this.fleaPrices[itemID] != "undefined") {
      // Forgot quotes, typeof returns string..
      return this.fleaPrices[itemID];
    } else if (typeof this.getItemInHandbook(itemID)?.Price != "undefined") {
      return this.getItemInHandbook(itemID).Price;
    } else {
      return 0;
    }
  }

  getBestPrice(itemID: string): number {
    if (typeof this.fleaPrices[itemID] != "undefined") {
      return this.fleaPrices[itemID];
    } else {
      return this.getItemBestTrader(itemID).price;
    }
  }

  bartersResolver(itemID: string): ResolvedBarter[] {
    const itemBarters: ResolvedBarter[] = [];

    try {
      this.traderList.forEach((trader) => {
        const allTraderBarters = trader.assort.items;
        const traderBarters = allTraderBarters.filter((x) => x._tpl == itemID);
        const barters = traderBarters
          .map((barter) => recursion(barter)) // find and get list of "parent items" for a passed component
          .map((barter) => ({
            // reset parentItem for actual parent items because of recursion function.
            // can be done in a more elegant way, but i'm too tired after a night of debugging. who cares anyway, it works.
            parentItem: barter.originalItemID
              ? barter.originalItemID == itemID
                ? null
                : barter.originalItemID
              : null,
            barterResources: trader.assort.barter_scheme[barter._id][0],
            barterLoyaltyLevel: trader.assort.loyal_level_items[barter._id],
            traderID: trader.base._id,
          }));
        itemBarters.push(...barters);

        function recursion(barter: PlaceholderItem): PlaceholderItem {
          if (barter.parentId == "hideout") {
            return barter;
          } else {
            let parentBarter;
            try {
              // spent literary 12 hours debugging this feature... KMP.
              // all because of one item, SWORD International Mk-18 not having proper .parentId is assort table. who would have thought. thx Nikita
              parentBarter = allTraderBarters.find(
                (x) => x._id == barter.parentId
              );
              parentBarter.originalItemID = parentBarter._tpl;
            } catch (error) {
              return barter; // FML
            }
            return recursion(parentBarter);
          }
        }
      });
    } catch (error) {
      this.logger.debug(
        "\n[ItemInfo] bartersResolver failed because of another mod. Send bug report. Continue safely."
      );
    }

    return itemBarters;
  }

  barterInfoGenerator(itemBarters: ResolvedBarter[], locale = "en") {
    let barterString = "";
    const rarityArray = [];
    const prices = [];

    for (const barter of itemBarters) {
      let totalBarterPrice = 0;
      let totalBarterPriceString = "";
      const traderName = this.locales[locale][`${barter.traderID} Nickname`];
      let partOf = "";

      if (barter.parentItem != null) {
        partOf = ` ∈ ${this.getItemShortName(barter.parentItem, locale)}`;
      }

      barterString += `${translations[locale].Bought}${partOf} ${translations[locale].at} ${traderName} ${translations[locale].lv}${barter.barterLoyaltyLevel} < `;

      let isBarter = false;
      for (const resource of barter.barterResources) {
        if (resource._tpl == "5449016a4bdc2d6f028b456f") {
          const rubles = resource.count;
          barterString += `${this.formatPrice(Math.round(rubles))}₽ + `;
        } else if (resource._tpl == "569668774bdc2da2298b4568") {
          const euro = resource.count;
          barterString += `${this.formatPrice(
            Math.round(euro)
          )}€ ≈ ${this.formatPrice(Math.round(this.euroRatio * euro))}₽ + `;
        } else if (resource._tpl == "5696686a4bdc2da3298b456a") {
          const dollars = resource.count;
          barterString += `$${this.formatPrice(
            Math.round(dollars)
          )} ≈ ${this.formatPrice(Math.round(this.dollarRatio * dollars))}₽ + `;
        } else {
          totalBarterPrice += this.getFleaPrice(resource._tpl) * resource.count;
          barterString += this.getItemShortName(resource._tpl, locale);
          barterString += ` ×${resource.count} + `;
          isBarter = true;
        }
      }

      if (isBarter) {
        rarityArray.push(barter.barterLoyaltyLevel + 1);
      } else {
        rarityArray.push(barter.barterLoyaltyLevel);
      }

      if (totalBarterPrice != 0) {
        totalBarterPriceString = ` | Σ ≈ ${this.formatPrice(
          Math.round(totalBarterPrice)
        )}₽`;
      }

      barterString =
        barterString.slice(0, barterString.length - 3) +
        totalBarterPriceString +
        "\n";
    }

    return {
      prices: prices, //TODO
      barters: barterString,
      rarity: rarityArray.length == 0 ? 0 : Math.min(...rarityArray),
    };
  }

  barterResourceInfoGenerator(itemID: string, locale = "en"): string {
    // Refactor this abomination pls
    let baseBarterString = "";
    for (const trader of this.traderList) {
      const traderName = this.locales[locale][`${trader.base._id} Nickname`];
      for (const barterID in trader.assort.barter_scheme) {
        // iterate all seller barters
        for (const srcs in trader.assort.barter_scheme[barterID][0]) {
          if (trader.assort.barter_scheme[barterID][0][srcs]._tpl === itemID) {
            const barterResources = trader.assort.barter_scheme[barterID][0];
            let bartedForItem: string;
            let totalBarterPrice = 0;
            const barterLoyaltyLevel =
              trader.assort.loyal_level_items[barterID];

            for (const originalBarter in trader.assort.items) {
              if (trader.assort.items[originalBarter]._id == barterID) {
                bartedForItem = trader.assort.items[originalBarter]._tpl;
              }
            }

            baseBarterString +=
              translations[locale].Traded +
              " ×" +
              trader.assort.barter_scheme[barterID][0][srcs].count +
              " ";
            baseBarterString +=
              translations[locale].at +
              " " +
              traderName +
              " " +
              translations[locale].lv +
              barterLoyaltyLevel +
              " > " +
              this.getItemName(bartedForItem, locale);

            let extendedBarterString = " < … + ";
            for (const barterResource in barterResources) {
              totalBarterPrice +=
                this.getFleaPrice(barterResources[barterResource]._tpl) *
                barterResources[barterResource].count;
              if (barterResources[barterResource]._tpl != itemID) {
                extendedBarterString += this.getItemShortName(
                  barterResources[barterResource]._tpl,
                  locale
                );
                extendedBarterString += ` ×${barterResources[barterResource].count} + `;
              }
            }

            const barterStringToAppend =
              totalBarterPrice != 0
                ? ` | Δ ≈ ${this.formatPrice(
                    Math.round(
                      this.getFleaPrice(bartedForItem) - totalBarterPrice
                    )
                  )}₽`
                : null;

            extendedBarterString = extendedBarterString.slice(
              0,
              extendedBarterString.length - 3
            );
            extendedBarterString += barterStringToAppend;
            baseBarterString += extendedBarterString + newLine;
          }
        }
      }
    }
    return baseBarterString;
  }

  getCraftingAreaName(areaType: number, locale = "en"): string {
    const stringName = `hideout_area_${areaType}_name`;
    return this.locales[locale][stringName];
  }

  getCraftingRarity(areaType: number, level: number): number {
    for (const s in this.hideoutAreas[areaType].stages) {
      if (Number.parseInt(s) > 1) {
        return level + 1;
      } else {
        return 4;
      }
    }
  }

  productionGenarator(itemID: string, locale = "en"): string {
    let craftableString = "";
    const rarityArray = [];

    for (const recipeId in this.hideoutProduction) {
      if (
        itemID === this.hideoutProduction[recipeId].endProduct &&
        this.hideoutProduction[recipeId].areaType !== 21
      ) {
        // Find every recipe for itemid and don't use Christmas Tree crafts
        const recipe = this.hideoutProduction[recipeId];
        let componentsString = "";
        let recipeAreaString = this.getCraftingAreaName(
          recipe.areaType,
          locale
        );
        let totalRecipePrice = 0;
        let recipeDivision = "";
        let questReq = "";

        for (const requirement of recipe.requirements) {
          if (requirement.type === "Area") {
            recipeAreaString =
              this.getCraftingAreaName(requirement.areaType, locale) +
              " " +
              translations[locale].lv +
              requirement.requiredLevel;
            rarityArray.push(
              this.getCraftingRarity(
                requirement.areaType,
                requirement.requiredLevel
              )
            );
          }
          if (requirement.type === "Item") {
            const craftComponentId = requirement.templateId;
            const craftComponentCount = requirement.count;
            const craftComponentPrice = this.getFleaPrice(craftComponentId);

            componentsString +=
              this.getItemShortName(craftComponentId, locale) +
              " ×" +
              craftComponentCount +
              " + ";
            totalRecipePrice += craftComponentPrice * craftComponentCount;
          }
          if (requirement.type === "Resource") {
            // superwater calculation
            const craftComponentId = requirement.templateId;
            const resourceProportion =
              requirement.resource /
              this.items[requirement.templateId]._props.Resource;
            const craftComponentPrice = this.getFleaPrice(craftComponentId);

            componentsString +=
              this.getItemShortName(craftComponentId, locale) +
              " ×" +
              Math.round(resourceProportion * 100) +
              "%" +
              " + ";
            totalRecipePrice += Math.round(
              craftComponentPrice * resourceProportion
            );
          }
          if (requirement.type === "QuestComplete") {
            questReq = ` (${
              this.locales[locale][`${requirement.questId} name`]
            }✔)`;
          }
        }

        if (recipe.count > 1) {
          recipeDivision = " " + translations[locale].peritem;
        }

        componentsString = componentsString.slice(
          0,
          componentsString.length - 3
        );

        if (recipe.endProduct === "59faff1d86f7746c51718c9c") {
          craftableString += `${translations[locale].Crafted} @ ${recipeAreaString}`;
          const bitcoinTime = recipe.productionTime;
          // prettier-ignore
          craftableString += ` | 1× GPU: ${this.convertTime(this.gpuTime(1, bitcoinTime), locale)}, 10× GPU: ${this.convertTime(this.gpuTime(10, bitcoinTime), locale)}, 25× GPU: ${this.convertTime(this.gpuTime(25, bitcoinTime), locale)}, 50× GPU: ${this.convertTime(this.gpuTime(50, bitcoinTime), locale)}`

          // 					log(`
          // // Base time (x${roundWithPrecision(145000/time, 2)}): ${convertTime(time)}, GPU Boost: x${roundWithPrecision(tables.hideout.settings.gpuBoostRate/0.041225, 2)}
          // // 2× GPU: ${convertTime(gpuTime(2))} x${roundWithPrecision(time/gpuTime(2), 2)}
          // // 10× GPU: ${convertTime(gpuTime(10))} x${roundWithPrecision(time/gpuTime(10), 2)}
          // // 25× GPU: ${convertTime(gpuTime(25))} x${roundWithPrecision(time/gpuTime(25), 2)}
          // // 50× GPU: ${convertTime(gpuTime(50))} x${roundWithPrecision(time/gpuTime(50), 2)}`)
        } else {
          craftableString += `${translations[locale].Crafted} ×${recipe.count} @ ${recipeAreaString}${questReq} < `;
          craftableString += `${componentsString} | Σ${recipeDivision} ≈ ${this.formatPrice(
            Math.round(totalRecipePrice / recipe.count)
          )}₽\n`;
        }

        //				function convertTime(time: number, locale = "en"): string {
        //					const hours = Math.trunc(time / 60 / 60)
        //					const minutes = Math.round((time - hours * 60 * 60) / 60)
        //					return `${hours}${this.locales[locale].HOURS} ${minutes}${this.locales[locale].Min}`
        //				}
        //
        //				function gpuTime(gpus: number, time: number): number {
        //					return time / (1 + (gpus - 1) * this.tables.hideout.settings.gpuBoostRate)
        //				}
        // if (fleaPrice > totalRecipePrice/recipe.count) {
        // 	let profit = Math.round(fleaPrice-(totalRecipePrice/recipe.count))
        // 	console.log("Hava Nagila! Profitable craft at " + profit + " profit detected! " + this.GetItemName(id) + " can be crafted at " + recipeAreaString)
        // }
      }
    }
    return craftableString;
  }

  convertTime(time: number, locale = "en"): string {
    const hours = Math.trunc(time / 60 / 60);
    const minutes = Math.round((time - hours * 60 * 60) / 60);
    return `${hours}${this.locales[locale].HOURS} ${minutes}${this.locales[locale].Min}`;
  }

  gpuTime(gpus: number, time: number): number {
    return time / (1 + (gpus - 1) * this.tables.hideout.settings.gpuBoostRate);
  }

  HideoutInfoGenerator(itemID: string, locale = "en"): string {
    // make it like this
    // const r = data.filter(d => d.courses.every(c => courses.includes(c.id)));

    let hideoutString = "";
    for (const area of this.hideoutAreas) {
      for (const stage in area.stages) {
        for (const requirement of area.stages[stage].requirements) {
          if (requirement.templateId === itemID) {
            hideoutString += `${translations[locale].Need} ×${
              requirement.count
            } > ${this.getCraftingAreaName(area.type, locale)} ${
              translations[locale].lv
            }${stage}\n`;
          }
        }
      }
    }
    // console.log(hideoutString)
    return hideoutString;
  }

  CraftingMaterialInfoGenarator(itemID: string, locale = "en"): string {
    let usedForCraftingString = "";
    // let totalCraftingPrice = 0 // Unused

    for (const recipe of this.hideoutProduction) {
      for (const s in recipe.requirements) {
        if (recipe.requirements[s].templateId === itemID) {
          let usedForCraftingComponentsString = " < … + ";
          let recipeAreaString = "";
          let totalRecipePrice = 0;
          let questReq = "";

          for (const requirement of recipe.requirements) {
            if (requirement.type == "Area") {
              // prettier-ignore
              recipeAreaString = this.getCraftingAreaName(requirement.areaType, locale) + " " + translations[locale].lv + requirement.requiredLevel
            }
            if (requirement.type == "Item") {
              const craftComponent = requirement;
              if (craftComponent.templateId != itemID) {
                usedForCraftingComponentsString +=
                  this.getItemShortName(craftComponent.templateId, locale) +
                  " ×" +
                  craftComponent.count +
                  " + ";
              }
              totalRecipePrice +=
                this.getFleaPrice(craftComponent.templateId) *
                craftComponent.count;
            }
            if (requirement.type == "Resource") {
              const craftComponent = requirement;
              const resourceProportion =
                craftComponent.resource /
                this.items[craftComponent.templateId]._props.Resource;
              if (craftComponent.templateId != itemID) {
                usedForCraftingComponentsString +=
                  this.getItemShortName(craftComponent.templateId, locale) +
                  " ×" +
                  Math.round(resourceProportion * 100) +
                  "%" +
                  " + ";
              }
              totalRecipePrice += Math.round(
                this.getFleaPrice(craftComponent.templateId) *
                  resourceProportion
              );
            }
            if (requirement.type === "QuestComplete") {
              questReq = ` (${
                this.locales[locale][`${requirement.questId} name`]
              }✔) `;
            }
          }
          usedForCraftingComponentsString = usedForCraftingComponentsString.slice(
            0,
            usedForCraftingComponentsString.length - 3
          );
          // prettier-ignore
          usedForCraftingComponentsString += ` | Δ ≈ ${this.formatPrice(Math.round(this.getFleaPrice(recipe.endProduct) * recipe.count - totalRecipePrice))}₽`
          // prettier-ignore
          usedForCraftingString += `${recipe.requirements[s].type == "Tool" ? translations[locale].Tool : translations[locale].Part + " ×" + recipe.requirements[s].count} > ${this.getItemName(recipe.endProduct, locale)} ×${recipe.count}`
          usedForCraftingString += ` @ ${
            recipeAreaString + questReq + usedForCraftingComponentsString
          }\n`;
        }
      }
    }
    // console.log(hideoutString)
    // log (usedForCraftingString)
    return usedForCraftingString;
  }

  QuestInfoGenerator(itemID: string, locale = "en"): string {
    let questString = "";
    for (const questID in this.quests) {
      const questName = this.locales[locale][`${questID} name`];

      const questConditions = this.quests[questID].conditions
        .AvailableForFinish;
      for (const condition of questConditions) {
        if (
          condition.conditionType == "HandoverItem" &&
          condition.target.includes(itemID)
        ) {
          const trader = this.quests[questID].traderId;
          //let tradeName = tables.traders[trader].base.nickname
          const traderName = this.locales[locale][`${trader} Nickname`];
          // prettier-ignore
          questString += `${translations[locale].Found} ${condition.onlyFoundInRaid ? "(✔) " : ""}×${condition.value} > ${questName} @ ${traderName}\n`
        }
      }
    }
    return questString;
  }
}

function roundWithPrecision(num: number, precision: number): number {
  const multiplier = Math.pow(10, precision);
  return Math.round(num * multiplier) / multiplier;
}

const log = (i) => {
  // for my sanity and convenience
  console.log(i);
};

// A silly solution to some weird recursion logic that adds values to an object that shouldn't have them
interface PlaceholderItem extends Item {
  originalItemID?: string;
}

interface ResolvedBarter {
  parentItem: string;
  barterResources: IBarterScheme[];
  barterLoyaltyLevel: number;
  traderID: string;
}

module.exports = { mod: new ItemInfo() };
