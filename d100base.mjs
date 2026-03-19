import { CharacterData, ObjectItemData } from "./module/data-models.mjs";
import { D100Actor } from "./module/actor/actor.mjs";
import { D100Item } from "./module/item/item.mjs";
import { D100ActorSheet } from "./module/actor/actor-sheet.mjs";
import { D100ItemSheet } from "./module/item/item-sheet.mjs";

/* ======================================================== */
/* ======================= INIT ============================ */
/* ======================================================== */

Hooks.once("init", async () => {

  console.log("D100 Base | Initialisation du système");

  /* ========================= */
  /* CONFIG DOCUMENTS          */
  /* ========================= */

  CONFIG.Actor.documentClass = D100Actor;
  CONFIG.Item.documentClass = D100Item;

  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Item.dataModels.item = ObjectItemData;

  /* ========================= */
  /* HANDLEBARS HELPERS        */
  /* ========================= */

  if (!Handlebars.helpers.concat) {
    Handlebars.registerHelper("concat", function (...args) {
      return args.slice(0, -1).join("");
    });
  }

  if (!Handlebars.helpers.multiply) {
    Handlebars.registerHelper("multiply", function (a, b) {
      return a * b;
    });
  }

	/* ========================= */
	/* FORMAT NUMBER CLEAN       */
	/* ========================= */

	if (!Handlebars.helpers.formatNumberClean) {
	  Handlebars.registerHelper("formatNumberClean", function (value) {

		const num = Number(value ?? 0);

		if (Number.isNaN(num)) return "0";

		const rounded = Math.round(num * 100) / 100;

		// entier → pas de décimales
		if (Number.isInteger(rounded)) return rounded;

		return rounded.toFixed(2);
	  });
	}

  /* ========================= */
  /* TEMPLATES PARTIALS        */
  /* ========================= */

  await loadTemplates([
    "systems/d100base/templates/partials/inventory-node.hbs"
  ]);

  /* ========================= */
  /* ACTOR SHEET               */
  /* ========================= */

  Actors.unregisterSheet("core", ActorSheet);

  Actors.registerSheet("d100base", D100ActorSheet, {
    types: ["character"],
    makeDefault: true,
    label: "D100BASE.SheetActor"
  });

  /* ========================= */
  /* ITEM SHEET                */
  /* ========================= */

  Items.unregisterSheet("core", ItemSheet);

  Items.registerSheet("d100base", D100ItemSheet, {
    types: ["item"],
    makeDefault: true,
    label: "D100BASE.SheetItem"
  });

});


/* ======================================================== */
/* ======================= READY =========================== */
/* ======================================================== */

Hooks.once("ready", async () => {

  console.log("D100 Base | Ready");

  if (!game.user.isGM) return;

  try {
    await migrateLegacyContainers();
    console.log("D100 Base | Migration container terminée");
  } catch (err) {
    console.error("D100 Base | Erreur migration container", err);
  }

});


/* ======================================================== */
/* ======================= MIGRATION ======================= */
/* ======================================================== */

async function migrateLegacyContainers() {

  /* ========================= */
  /* ITEMS MONDE               */
  /* ========================= */

  for (const item of game.items) {

    const legacy = item.system?.container ?? null;
    const current = item.system?.containerId ?? null;

    if (legacy && !current) {

      await item.update({
        "system.containerId": legacy
      });

    }
  }

  /* ========================= */
  /* ITEMS ACTEURS             */
  /* ========================= */

  for (const actor of game.actors) {

    const updates = [];

    for (const item of actor.items) {

      const legacy = item.system?.container ?? null;
      const current = item.system?.containerId ?? null;

      if (legacy && !current) {

        updates.push({
          _id: item.id,
          "system.containerId": legacy
        });

      }
    }

    if (updates.length > 0) {
      await actor.updateEmbeddedDocuments("Item", updates);
    }

  }

}