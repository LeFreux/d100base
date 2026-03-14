import { CharacterData, ObjectItemData } from "./module/data-models.mjs";
import { D100Actor } from "./module/actor/actor.mjs";
import { D100Item } from "./module/item/item.mjs";
import { D100ActorSheet } from "./module/actor/actor-sheet.mjs";
import { D100ItemSheet } from "./module/item/item-sheet.mjs";

Hooks.once("init", () => {
  console.log("D100 Base | init");

  CONFIG.Actor.documentClass = D100Actor;
  CONFIG.Item.documentClass = D100Item;

  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Item.dataModels.item = ObjectItemData;

  DocumentSheetConfig.unregisterSheet(Actor, "core", ActorSheet);
  DocumentSheetConfig.registerSheet(Actor, "d100base", D100ActorSheet, {
    types: ["character"],
    makeDefault: true,
    label: "D100BASE.SheetActor"
  });

  DocumentSheetConfig.registerSheet(Item, "d100base", D100ItemSheet, {
    types: ["item"],
    makeDefault: true,
    label: "D100BASE.SheetItem"
  });
});