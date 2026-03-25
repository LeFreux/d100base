import { CharacterData, ObjectItemData } from "./module/data-models.mjs";
import { D100Actor } from "./module/actor/actor.mjs";
import { D100Item } from "./module/item/item.mjs";
import { D100ActorSheet } from "./module/actor/actor-sheet.mjs";
import { D100ItemSheet } from "./module/item/item-sheet.mjs";

const D100BASE_CONTAINER_MIGRATION_VERSION = "0.2.0";

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
  /* API SYSTÈME               */
  /* ========================= */

  game.d100base = {
    D100Actor,
    D100Item,
    D100ActorSheet,
    D100ItemSheet,
    migrateLegacyContainers,
    migrateLegacyDefaultContents
  };

  /* ========================= */
  /* SETTINGS                  */
  /* ========================= */

  game.settings.register("d100base", "containerMigrationVersion", {
    name: "Version de migration des conteneurs",
    hint: "Utilisé en interne pour savoir si la migration des conteneurs a déjà été appliquée.",
    scope: "world",
    config: false,
    type: String,
    default: "0.0.0"
  });

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
      return Number(a || 0) * Number(b || 0);
    });
  }

  if (!Handlebars.helpers.formatNumberClean) {
    Handlebars.registerHelper("formatNumberClean", function (value) {
      const num = Number(value ?? 0);

      if (Number.isNaN(num)) return "0";

      const rounded = Math.round(num * 100) / 100;

      if (Number.isInteger(rounded)) return String(rounded);
      return rounded.toFixed(2);
    });
  }

  /* ========================= */
  /* TEMPLATES PARTIALS        */
  /* ========================= */

  await loadTemplates([
    "systems/d100base/templates/partials/inventory-node.hbs",
    "systems/d100base/templates/partials/localized-wounds.hbs"
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
    await runContainerMigrationsIfNeeded();
  } catch (err) {
    console.error("D100 Base | Erreur migration conteneurs", err);
    ui.notifications?.error("D100 Base | Une erreur est survenue pendant la migration des conteneurs. Consulte la console.");
  }

});

/* ======================================================== */
/* ======================= MIGRATION ======================= */
/* ======================================================== */

async function runContainerMigrationsIfNeeded() {
  const storedVersion = game.settings.get("d100base", "containerMigrationVersion") ?? "0.0.0";

  if (!foundry.utils.isNewerVersion(D100BASE_CONTAINER_MIGRATION_VERSION, storedVersion)) {
    console.log(`D100 Base | Migration conteneurs déjà appliquée (${storedVersion})`);
    return;
  }

  console.log(
    `D100 Base | Migration conteneurs en cours (${storedVersion} -> ${D100BASE_CONTAINER_MIGRATION_VERSION})`
  );

  const summary = {
    worldItemsNormalized: 0,
    actorItemsNormalized: 0,
    defaultContentsConverted: 0,
    defaultContentsRemoved: 0
  };

  summary.worldItemsNormalized += await migrateLegacyContainersOnWorldItems();

  const actorSummary = await migrateLegacyContainersOnActorItems();
  summary.actorItemsNormalized += actorSummary.normalized;
  summary.defaultContentsConverted += actorSummary.converted;
  summary.defaultContentsRemoved += actorSummary.removed;

  await game.settings.set(
    "d100base",
    "containerMigrationVersion",
    D100BASE_CONTAINER_MIGRATION_VERSION
  );

  console.log("D100 Base | Migration conteneurs terminée", summary);

  ui.notifications?.info(
    `D100 Base | Migration conteneurs terminée : `
    + `${summary.actorItemsNormalized + summary.worldItemsNormalized} relations normalisées, `
    + `${summary.defaultContentsConverted} contenus convertis, `
    + `${summary.defaultContentsRemoved} champs defaultContents supprimés.`
  );
}

/* ---------------------------------------- */
/* MIGRATION 1 : container -> containerId   */
/* ---------------------------------------- */

async function migrateLegacyContainers() {
  const worldItemsNormalized = await migrateLegacyContainersOnWorldItems();
  const actorSummary = await migrateLegacyContainersOnActorItems();

  return {
    worldItemsNormalized,
    actorItemsNormalized: actorSummary.normalized
  };
}

async function migrateLegacyContainersOnWorldItems() {
  let normalized = 0;

  for (const item of game.items) {
    const legacy = item.system?.container ?? null;
    const current = item.system?.containerId ?? null;

    if (legacy && !current) {
      await item.update({
        "system.containerId": legacy
      });
      normalized += 1;
    }
  }

  return normalized;
}

async function migrateLegacyContainersOnActorItems() {
  let normalized = 0;
  let converted = 0;
  let removed = 0;

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
        normalized += 1;
      }
    }

    if (updates.length > 0) {
      await actor.updateEmbeddedDocuments("Item", updates);
    }

    const migration = await migrateLegacyDefaultContents(actor);
    converted += migration.converted;
    removed += migration.removed;
  }

  return { normalized, converted, removed };
}

/* ---------------------------------------- */
/* MIGRATION 2 : suppression defaultContents */
/* ---------------------------------------- */

/**
 * Stratégie choisie :
 * - pour les conteneurs possédés par un acteur :
 *   convertir les anciennes entrées defaultContents en vrais Items embarqués ;
 * - uniquement si le conteneur n’a pas déjà un contenu réel ;
 * - puis supprimer le champ system.defaultContents ;
 * - pour les world items, on nettoiera seulement le champ si nécessaire,
 *   mais on ne crée pas de runtime items hors acteur.
 */
async function migrateLegacyDefaultContents(actor) {
  let converted = 0;
  let removed = 0;

  for (const container of actor.items) {
    if (!container.system?.isContainer) continue;

    const defaultContents = container.system?.defaultContents;
    if (!Array.isArray(defaultContents) || defaultContents.length === 0) continue;

    const existingChildren = actor.items.filter(i => {
      const containerId = i.system?.containerId ?? i.system?.container ?? null;
      return containerId === container.id;
    });

    /**
     * Si le conteneur a déjà des vrais enfants runtime,
     * on considère que la migration a déjà été faite ou que le contenu a été recréé.
     * Dans ce cas, on ne reconvertit pas pour éviter les doublons.
     */
    if (existingChildren.length === 0) {
      const createdData = defaultContents
        .map(content => legacyContentToItemData(content, container.id))
        .filter(Boolean);

      if (createdData.length > 0) {
        await actor.createEmbeddedDocuments("Item", createdData);
        converted += createdData.length;
      }
    }

    await container.update({
      "system.-=defaultContents": null
    });

    removed += 1;
  }

  return { converted, removed };
}

/**
 * Nettoyage manuel possible pour les world items :
 * on retire defaultContents s’il existe encore, car il n’est plus utilisé par le runtime.
 */
async function removeLegacyDefaultContentsFromWorldItems() {
  let removed = 0;

  for (const item of game.items) {
    const defaultContents = item.system?.defaultContents;
    if (!Array.isArray(defaultContents) || defaultContents.length === 0) continue;

    await item.update({
      "system.-=defaultContents": null
    });

    removed += 1;
  }

  return removed;
}

/**
 * Convertit une ancienne entrée JSON de defaultContents
 * en vraie donnée d’Item embarqué.
 *
 * Hypothèses de migration :
 * - on reste sur le type d’item unique "item" défini dans system.json ;
 * - on mappe uniquement les champs utiles au nouveau runtime ;
 * - les anciens contenus imbriqués éventuels ne sont pas reconvertis récursivement ici,
 *   car le modèle cible repose sur des embedded items réels et les anciennes données
 *   JSON ne garantissent pas une structure suffisamment fiable pour reconstituer
 *   proprement plusieurs niveaux.
 */
function legacyContentToItemData(content, containerId) {
  if (!content || typeof content !== "object") return null;

  const quantity = Math.max(0, Math.floor(Number(content.quantity ?? 1) || 1));

  const legacyTotalWeight = Math.max(0, Number(content.weight ?? 0));
  const explicitUnitWeight = content.unitWeight ?? null;

  const unitWeight = Math.max(
    0,
    Number(
      explicitUnitWeight ?? (quantity > 0 ? legacyTotalWeight / quantity : 0)
    )
  );

  const isContainer = !!content.isContainer;

  return {
    name: content.name || "Objet migré",
    type: "item",
    img: content.img || "icons/svg/item-bag.svg",
    system: {
      category: content.category || "Divers",
      description: content.description || "",
      quantity,
      unitWeight,
      weight: Math.round((unitWeight * quantity) * 100) / 100,
      container: containerId,
      containerId,
      expanded: true,
      isContainer,
      emptyWeight: Math.max(0, Number(content.emptyWeight ?? 0)),
      capacityWeight: Math.max(0, Number(content.capacityWeight ?? 0)),
      merged: false,
      mergeGroupId: null
    }
  };
}