import { CharacterData, ObjectItemData } from "./module/data-models.mjs";
import { D100Actor } from "./module/actor/actor.mjs";
import { D100Item } from "./module/item/item.mjs";
import { D100ActorSheet } from "./module/actor/actor-sheet.mjs";
import { D100ItemSheet } from "./module/item/item-sheet.mjs";
import { D100AttributeHud } from "./module/hud/attribute-hud.mjs";

const D100BASE_CONTAINER_MIGRATION_VERSION = "0.2.9";

let d100AttributeHud = null;
let d100BaseOriginalCombatRollInitiative = null;
const d100PendingInventoryRenders = new Map();
let d100BaseSocket = null;

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
    D100AttributeHud,
    attributeHud: null,

    getSingleControlledD100Token,
    getTokenForCombatant,
    setCombatantInitiative,
    rollCombatantInitiative,
    rollCombatantInitiatives,
    patchStandardCombatRollInitiative,

    // Proxy GM pour les transferts d'inventaire inter-acteurs
    requestInventoryTransferAsGM,
    requestAttributeHudSync,
	
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
    "systems/d100base/templates/partials/localized-wounds.hbs",
    "systems/d100base/templates/partials/chat-d100-roll.hbs"
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
  
  patchStandardCombatRollInitiative();

});

Hooks.once("socketlib.ready", () => {
  d100BaseSocket = socketlib.registerSystem("d100base");
  d100BaseSocket.register("executeInventoryTransfer", executeInventoryTransferAsGM);
});

/* ======================================================== */
/* ======================= READY =========================== */
/* ======================================================== */

Hooks.once("ready", async () => {

  console.log("D100 Base | Ready");

  if (d100AttributeHud) {
    d100AttributeHud.destroy();
  }

  d100AttributeHud = new D100AttributeHud();
  d100AttributeHud.init();

  if (game.d100base) {
    game.d100base.attributeHud = d100AttributeHud;
  }

  requestAttributeHudSync();

  if (!game.user.isGM) return;

  try {
    await runContainerMigrationsIfNeeded();
  } catch (err) {
    console.error("D100 Base | Erreur migration conteneurs", err);
    ui.notifications?.error("D100 Base | Une erreur est survenue pendant la migration des conteneurs. Consulte la console.");
  }

});

/* ======================================================== */
/* ================= COMBAT / INITIATIVE ================== */
/* ======================================================== */

/**
 * Retourne le Token source d’un combatant si possible.
 *
 * Priorité :
 * - token présent sur le canvas actif
 * - token document de la scène du combat
 */
function getTokenForCombatant(combatant) {
  if (!combatant?.tokenId) return null;

  const activeToken = canvas?.tokens?.get(combatant.tokenId);
  if (activeToken) return activeToken;

  const sceneId =
    combatant.sceneId ??
    combatant.parent?.scene?.id ??
    combatant.parent?.sceneId ??
    null;

  const scene = sceneId ? game.scenes?.get(sceneId) : null;
  const tokenDocument = scene?.tokens?.get(combatant.tokenId) ?? null;

  return tokenDocument?.object ?? tokenDocument ?? null;
}

/**
 * Détermine si un combatant peut utiliser la logique
 * d’initiative custom du système.
 */
function isD100InitiativeCombatant(combatant) {
  return !!(
    combatant &&
    combatant.actor &&
    typeof combatant.actor.rollInitiative === "function"
  );
}

/**
 * Résout une liste de combatants à partir :
 * - de null => tous les combatants du combat
 * - d’un id
 * - d’un document combatant
 * - d’une liste mixte
 */
function resolveCombatantsInCombat(combat, combatantsOrIds = null) {
  if (!combat) return [];

  if (combatantsOrIds == null) {
    return Array.from(combat.combatants);
  }

  const entries = Array.isArray(combatantsOrIds)
    ? combatantsOrIds
    : [combatantsOrIds];

  return entries
    .map(entry => {
      if (!entry) return null;
      if (typeof entry === "string") return combat.combatants.get(entry) ?? null;
      if (entry.id && combat.combatants.get(entry.id)) return combat.combatants.get(entry.id);
      return null;
    })
    .filter(Boolean);
}

/**
 * Applique officiellement une initiative à un combatant.
 * On passe par Combat.setInitiative pour laisser Foundry
 * recalculer l’ordre des tours correctement.
 */
async function setCombatantInitiative(combatant, initiativeValue) {
  if (!combatant) return false;

  const combat = combatant.parent ?? game.combats?.active;
  if (!combat) return false;

  await combat.setInitiative(combatant.id, Number(initiativeValue ?? 0));
  return true;
}

/**
 * Lance l’initiative pour un combatant donné
 * en réutilisant la logique d’acteur token-aware.
 */
async function rollCombatantInitiative(combatant) {
  if (!isD100InitiativeCombatant(combatant)) return null;

  const token = getTokenForCombatant(combatant);
  return combatant.actor.rollInitiative({ token });
}

/**
 * Lance l’initiative pour une liste de combatants.
 * Accepte soit :
 * - des ids de combatants,
 * - des documents Combatant,
 * - ou null => tous les combatants du combat actif
 */
async function rollCombatantInitiatives(combatants = null, { combat = null } = {}) {
  const targetCombat = combat ?? game.combats?.active;
  if (!targetCombat) {
    ui.notifications?.warn("Aucun combat actif.");
    return [];
  }

  const resolvedCombatants = resolveCombatantsInCombat(targetCombat, combatants);
  const results = [];

  for (const combatant of resolvedCombatants) {
    const result = await rollCombatantInitiative(combatant);
    results.push({
      combatantId: combatant.id,
      result
    });
  }

  return results;
}

/**
 * Patch le flux standard Foundry d’initiative pour que
 * tout appel à combat.rollInitiative(...) passe par
 * la logique custom du système quand c’est applicable.
 *
 * C’est ce pont qui permet au carousel / tracker standard
 * d’utiliser le jet d’initiative custom.
 */
function patchStandardCombatRollInitiative() {
  if (d100BaseOriginalCombatRollInitiative) return;
  if (!Combat?.prototype?.rollInitiative) return;

  d100BaseOriginalCombatRollInitiative = Combat.prototype.rollInitiative;

  Combat.prototype.rollInitiative = async function (ids, options = {}) {
    const resolvedCombatants = resolveCombatantsInCombat(this, ids);

    if (resolvedCombatants.length === 0) {
      return d100BaseOriginalCombatRollInitiative.call(this, ids, options);
    }

    const customCombatants = [];
    const fallbackCombatantIds = [];

    for (const combatant of resolvedCombatants) {
      if (isD100InitiativeCombatant(combatant)) {
        customCombatants.push(combatant);
      } else {
        fallbackCombatantIds.push(combatant.id);
      }
    }

    for (const combatant of customCombatants) {
      await rollCombatantInitiative(combatant);
    }

    if (fallbackCombatantIds.length > 0) {
      await d100BaseOriginalCombatRollInitiative.call(this, fallbackCombatantIds, options);
    }

    return this;
  };

  console.log("D100 Base | Patch Combat.rollInitiative activé");
}

/* ======================================================== */
/* ============== INVENTORY TRANSFER SOCKET =============== */
/* ======================================================== */

async function requestInventoryTransferAsGM(payload = {}) {
  if (game.user.isGM) {
    return executeInventoryTransferAsGM(payload);
  }

  if (!d100BaseSocket) {
    ui.notifications?.error(
      game.i18n.localize("D100BASE.Errors.InventoryTransferProxyUnavailable")
    );
    throw new Error("D100 Base | socketlib n'est pas disponible.");
  }

  return d100BaseSocket.executeAsGM("executeInventoryTransfer", payload);
}

function resolveTransferSourceScene({
  sourceSceneId = null,
  sourceTokenId = null
} = {}) {
  if (sourceSceneId) {
    return game.scenes?.get(sourceSceneId) ?? null;
  }

  if (sourceTokenId) {
    for (const scene of game.scenes ?? []) {
      if (scene?.tokens?.get(sourceTokenId)) {
        return scene;
      }
    }
  }

  return null;
}

function resolveTransferSourceTokenDocument({
  sourceTokenId = null,
  sourceSceneId = null
} = {}) {
  if (!sourceTokenId) return null;

  const scene = resolveTransferSourceScene({ sourceSceneId, sourceTokenId });
  if (!scene) return null;

  return scene.tokens?.get(sourceTokenId) ?? null;
}

function resolveTransferSourceActor({
  sourceActorId = null,
  sourceTokenId = null,
  sourceSceneId = null
} = {}) {
  // 1) Priorité absolue : acteur synthétique du token source
  const sourceTokenDocument = resolveTransferSourceTokenDocument({
    sourceTokenId,
    sourceSceneId
  });

  const sourceTokenActor = sourceTokenDocument?.actor ?? null;
  if (sourceTokenActor) {
    return sourceTokenActor;
  }

  // 2) Fallback final : acteur world
  if (sourceActorId) {
    return game.actors?.get(sourceActorId) ?? null;
  }

  return null;
}

function getTransferRequestUser(requestingUserId) {
  if (!requestingUserId) return null;
  return game.users?.get(requestingUserId) ?? null;
}

function userHasActorPermission(user, actor, minimumLevel) {
  if (!user || !actor) return false;
  return actor.testUserPermission(user, minimumLevel);
}

function getActorTokensOnScene(scene, actorId) {
  if (!scene || !actorId) return [];

  return Array.from(scene.tokens ?? [])
    .filter(token => token?.actor?.id === actorId);
}

function getVisibleTargetTokensOnScene({
  scene,
  sourceTokenDocument,
  targetActorId
} = {}) {
  if (!scene || !sourceTokenDocument || !targetActorId) return [];

  const sourceToken = sourceTokenDocument.object ?? null;
  if (!sourceToken) return [];

  const visionSource = sourceToken.vision ?? sourceToken.visionSource ?? null;
  const los = visionSource?.los ?? visionSource?.shape ?? null;
  if (!los?.contains) return [];

  return getActorTokensOnScene(scene, targetActorId).filter(targetTokenDocument => {
    if (!targetTokenDocument) return false;
    if (targetTokenDocument.hidden) return false;

    const targetToken = targetTokenDocument.object ?? null;

    const point = targetToken?.center ?? {
      x: Number(targetTokenDocument.x ?? 0) + (Number(targetTokenDocument.width ?? 1) * canvas.grid.size / 2),
      y: Number(targetTokenDocument.y ?? 0) + (Number(targetTokenDocument.height ?? 1) * canvas.grid.size / 2)
    };

    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;

    return los.contains(point.x, point.y);
  });
}

function validateInventoryTransferRequest({
  requestingUserId = null,
  sourceActor = null,
  sourceActorId = null,
  sourceTokenDocument = null,
  targetActor = null,
  targetActorId = null,
  sourceScene = null
} = {}) {
  const requestingUser = getTransferRequestUser(requestingUserId);

  if (!requestingUser) {
    return {
      success: false,
      reason: "Utilisateur initiateur du transfert introuvable."
    };
  }

  if (!sourceActor) {
    return {
      success: false,
      reason: "Acteur source introuvable."
    };
  }

  if (!targetActor) {
    return {
      success: false,
      reason: "Acteur cible introuvable."
    };
  }

  if (!sourceScene) {
    return {
      success: false,
      reason: "Scène source introuvable pour le transfert."
    };
  }

  if (!sourceTokenDocument) {
    return {
      success: false,
      reason: "Le transfert n'est autorisé que depuis un token source présent sur la scène."
    };
  }

  const canTransferFromSource = userHasActorPermission(
    requestingUser,
    sourceActor,
    CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
  );

  if (!canTransferFromSource) {
    return {
      success: false,
      reason: "Vous devez être propriétaire de l'acteur source pour transférer un objet."
    };
  }

  const canTransferToTarget = userHasActorPermission(
    requestingUser,
    targetActor,
    CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED
  );

  if (!canTransferToTarget) {
    return {
      success: false,
      reason: "Vous n'avez pas les permissions minimales sur l'acteur cible."
    };
  }

  const targetTokensOnScene = getActorTokensOnScene(sourceScene, targetActorId);
  if (!targetTokensOnScene.length) {
    return {
      success: false,
      reason: "L'acteur cible n'a aucun token sur la scène."
    };
  }

  const visibleTargetTokens = getVisibleTargetTokensOnScene({
    scene: sourceScene,
    sourceTokenDocument,
    targetActorId
  });

  if (!visibleTargetTokens.length) {
    return {
      success: false,
      reason: "Aucun token visible de l'acteur cible n'est à portée de vue du token source."
    };
  }

  return {
    success: true,
    requestingUser
  };
}

async function executeInventoryTransferAsGM({
  requestingUserId = null,
  sourceActorId,
  sourceTokenId = null,
  sourceSceneId = null,
  targetActorId,
  itemId,
  targetContainerId = null,
  transferAll = true
} = {}) {
  const sourceScene = resolveTransferSourceScene({
    sourceSceneId,
    sourceTokenId
  });

  const sourceTokenDocument = resolveTransferSourceTokenDocument({
    sourceTokenId,
    sourceSceneId
  });

  const sourceActor = resolveTransferSourceActor({
    sourceActorId,
    sourceTokenId,
    sourceSceneId
  });

  const targetActor = game.actors?.get(targetActorId) ?? null;

  if (!itemId) {
    return {
      success: false,
      reason: "Aucun itemId fourni pour le transfert."
    };
  }

  if (typeof sourceActor?.transferInventoryItemToActor !== "function") {
    return {
      success: false,
      reason: "La méthode de transfert de l'acteur source est introuvable."
    };
  }

  const validation = validateInventoryTransferRequest({
    requestingUserId,
    sourceActor,
    sourceActorId,
    sourceTokenDocument,
    targetActor,
    targetActorId,
    sourceScene
  });

  if (!validation.success) {
    return validation;
  }

  void transferAll; // compatibilité payload actuel ; non utilisé pour l’instant

  return sourceActor.transferInventoryItemToActor(
    itemId,
    targetActor,
    targetContainerId
  );
}

/* ======================================================== */
/* ================= ATTRIBUTE HUD ========================= */
/* ======================================================== */

function getSingleControlledD100Token() {
  const controlled = canvas?.tokens?.controlled ?? [];

  if (controlled.length !== 1) return null;

  const [token] = controlled;

  if (!token?.actor) return null;
  if (token.actor.type !== "character") return null;

  return token;
}

async function updateAttributeHudFromSelection() {
  if (!d100AttributeHud) return;

  const token = getSingleControlledD100Token();

  if (!token) {
    d100AttributeHud.clear();
    return;
  }

  await d100AttributeHud.bind(token);
}

function requestAttributeHudSync() {
  queueMicrotask(() => {
    void updateAttributeHudFromSelection();
  });
}

Hooks.on("controlToken", () => {
  requestAttributeHudSync();
});

Hooks.on("canvasReady", () => {
  requestAttributeHudSync();
});

Hooks.on("deleteToken", () => {
  requestAttributeHudSync();
});

Hooks.on("updateActor", (actor) => {
  void d100AttributeHud?.refreshIfActor(actor);
});

Hooks.on("createItem", (item) => {
  const actor = item?.parent instanceof Actor ? item.parent : null;
  if (!actor) return;

  scheduleActorInventoryRefresh(actor);
});

Hooks.on("updateItem", (item) => {
  const actor = item?.parent instanceof Actor ? item.parent : null;
  if (!actor) return;

  scheduleActorInventoryRefresh(actor);
});

Hooks.on("deleteItem", (item) => {
  const actor = item?.parent instanceof Actor ? item.parent : null;
  if (!actor) return;

  scheduleActorInventoryRefresh(actor);
});

Hooks.on("updateCombat", () => {
  requestAttributeHudSync();
});

Hooks.on("createCombatant", () => {
  requestAttributeHudSync();
});

Hooks.on("deleteCombatant", () => {
  requestAttributeHudSync();
});

Hooks.on("canvasTearDown", () => {
  d100AttributeHud?.clear();
});

Hooks.on("closeWorld", () => {
  d100BaseSocket = null;
});

/* ======================================================== */
/* ============== INVENTORY SHEET REFRESH ================== */
/* ======================================================== */

function getActorSheetApp(actor) {
  return actor?.sheet ?? null;
}

function getOwnedItemSheetApps(actor) {
  if (!actor) return [];

  return actor.items
    .map(item => item?.sheet ?? null)
    .filter(sheet => sheet?.rendered);
}

function renderActorInventoryRelatedSheets(actor) {
  if (!actor) return;

  const actorSheet = getActorSheetApp(actor);
  if (actorSheet?.rendered) {
    actorSheet.render(false);
  }

  for (const itemSheet of getOwnedItemSheetApps(actor)) {
    itemSheet.render(false);
  }
}

function scheduleActorInventoryRefresh(actor, delay = 40) {
  if (!actor?.id) return;

  const existing = d100PendingInventoryRenders.get(actor.id);
  if (existing) {
    clearTimeout(existing);
  }

  const timeoutId = setTimeout(() => {
    d100PendingInventoryRenders.delete(actor.id);
    renderActorInventoryRelatedSheets(actor);
  }, delay);

  d100PendingInventoryRenders.set(actor.id, timeoutId);
}

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