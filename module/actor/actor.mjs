import {
  LOCALIZED_WOUND_PARTS,
  LOCALIZED_WOUND_STATES
} from "../data-models.mjs";

export class D100Actor extends Actor {

  prepareDerivedData() {
    super.prepareDerivedData();

    this._prepareLocalizedWounds();
    this._normalizeEmbeddedItems();
    this._prepareInventoryTotals();
    this._prepareEncumbrance();
  }

  /* -------------------------------------------- */
  /* BLESSURES LOCALISÉES                         */
  /* -------------------------------------------- */

  /**
   * Retourne l’objet de référence des blessures localisées par défaut.
   */
  static getDefaultLocalizedWounds() {
    return {
      head: "indemne",
      torso: "indemne",
      rightArm: "indemne",
      leftArm: "indemne",
      rightLeg: "indemne",
      leftLeg: "indemne"
    };
  }

  /**
   * Vérifie qu’une clé de membre est valide.
   */
  isValidLocalizedWoundPart(partKey) {
    return LOCALIZED_WOUND_PARTS.includes(partKey);
  }

  /**
   * Vérifie qu’un état de blessure localisée est valide.
   */
  isValidLocalizedWoundState(stateKey) {
    return LOCALIZED_WOUND_STATES.includes(stateKey);
  }

  /**
   * Normalise en mémoire les blessures localisées pour garantir
   * une structure exploitable même sur des acteurs plus anciens.
   *
   * IMPORTANT :
   * - aucune écriture de document ici ;
   * - uniquement de la normalisation runtime.
   */
  _prepareLocalizedWounds() {
    if (!this.system.state) {
      this.system.state = {};
    }

    if (!this.system.state.localizedWounds) {
      this.system.state.localizedWounds = {};
    }

    const defaults = D100Actor.getDefaultLocalizedWounds();
    const localizedWounds = this.system.state.localizedWounds;

    for (const partKey of LOCALIZED_WOUND_PARTS) {
      const currentValue = localizedWounds[partKey];
      localizedWounds[partKey] = this.isValidLocalizedWoundState(currentValue)
        ? currentValue
        : defaults[partKey];
    }
  }

  /**
   * Retourne un snapshot normalisé des blessures localisées.
   */
  getLocalizedWounds() {
    const defaults = D100Actor.getDefaultLocalizedWounds();
    const localizedWounds = this.system.state?.localizedWounds ?? {};

    const result = {};

    for (const partKey of LOCALIZED_WOUND_PARTS) {
      const value = localizedWounds[partKey];
      result[partKey] = this.isValidLocalizedWoundState(value)
        ? value
        : defaults[partKey];
    }

    return result;
  }

  /**
   * Retourne l’état localisé d’un membre donné.
   */
  getLocalizedWound(partKey) {
    if (!this.isValidLocalizedWoundPart(partKey)) {
      return null;
    }

    return this.getLocalizedWounds()[partKey];
  }

  /**
   * Retourne le chemin de donnée Foundry d’un membre localisé.
   */
  getLocalizedWoundPath(partKey) {
    if (!this.isValidLocalizedWoundPart(partKey)) {
      return null;
    }

    return `system.state.localizedWounds.${partKey}`;
  }

  /**
   * Met à jour l’état d’un membre.
   */
  async setLocalizedWound(partKey, stateKey) {
    if (!this.isValidLocalizedWoundPart(partKey)) {
      ui.notifications?.warn(`Membre invalide : ${partKey}`);
      return false;
    }

    if (!this.isValidLocalizedWoundState(stateKey)) {
      ui.notifications?.warn(`État de blessure invalide : ${stateKey}`);
      return false;
    }

    const path = this.getLocalizedWoundPath(partKey);
    if (!path) return false;

    await this.update({
      [path]: stateKey
    });

    return true;
  }

  /**
   * Réinitialise tous les membres à l’état indemne.
   */
  async resetLocalizedWounds() {
    const updateData = {};

    for (const partKey of LOCALIZED_WOUND_PARTS) {
      updateData[`system.state.localizedWounds.${partKey}`] = "indemne";
    }

    await this.update(updateData);
    return true;
  }

  /**
   * Fournit un résumé simple, pratique pour de futures évolutions UI.
   */
  getLocalizedWoundSummary() {
    const wounds = this.getLocalizedWounds();
    const summary = {
      indemne: 0,
      blesse: 0,
      "gravement-blesse": 0,
      inoperant: 0,
      perdu: 0,
      artificiel: 0
    };

    for (const stateKey of Object.values(wounds)) {
      if (summary[stateKey] !== undefined) {
        summary[stateKey] += 1;
      }
    }

    return summary;
  }

  /* -------------------------------------------- */
  /* NORMALISATION                                */
  /* -------------------------------------------- */

  /**
   * Harmonise les anciennes données (system.container)
   * avec la nouvelle structure (system.containerId),
   * sans casser immédiatement les fiches déjà existantes.
   *
   * IMPORTANT :
   * - on ne crée pas / modifie pas de documents ici ;
   * - on normalise seulement les données dérivées en mémoire.
   */
  _normalizeEmbeddedItems() {
    for (const item of this.items) {
      const system = item.system;

      const legacyContainer = system.container ?? null;
      const currentContainerId = system.containerId ?? null;
      const normalizedContainerId = currentContainerId ?? legacyContainer ?? null;

      system.containerId = normalizedContainerId;
      system.container = normalizedContainerId;

      if (system.quantity === undefined || system.quantity === null) {
        system.quantity = 1;
      }

      // Option A : un conteneur est toujours une instance unique.
      if (system.isContainer) {
        system.quantity = 1;
      }

      if (system.weight === undefined || system.weight === null) {
        system.weight = 0;
      }

      if (system.unitWeight === undefined || system.unitWeight === null) {
        system.unitWeight = 0;
      }

      if (system.emptyWeight === undefined || system.emptyWeight === null) {
        system.emptyWeight = 0;
      }

      if (system.capacityWeight === undefined || system.capacityWeight === null) {
        system.capacityWeight = 0;
      }

      if (system.isContainer && typeof system.expanded !== "boolean") {
        system.expanded = true;
      }

      // Réinitialisation propre de l’état surcharge.
      system.overweight = false;
    }
  }

  /* -------------------------------------------- */
  /* HELPERS DE BASE                              */
  /* -------------------------------------------- */

  /**
   * Retourne l'ID de conteneur effectif d'un item ou d'un system data.
   */
  getEffectiveContainerId(itemOrSystem) {
    const system = itemOrSystem?.system ?? itemOrSystem ?? {};
    return system.containerId ?? system.container ?? null;
  }

  /**
   * Retourne un item de l'acteur par ID.
   */
  getInventoryItem(itemId) {
    return this.items.get(itemId) ?? null;
  }

  /**
   * Indique si un item est un conteneur.
   */
  isContainer(itemOrId) {
    const item = typeof itemOrId === "string" ? this.getInventoryItem(itemOrId) : itemOrId;
    return !!item?.system?.isContainer;
  }

  /**
   * Quantité runtime sûre.
   */
  getItemQuantity(itemOrId) {
    const item = typeof itemOrId === "string" ? this.getInventoryItem(itemOrId) : itemOrId;
    return Math.max(0, Number(item?.system?.quantity ?? 0));
  }

  /**
   * Retourne tous les items enfants directs d'un conteneur.
   */
  getContainerChildren(containerId) {
    return this.items.filter(item => this.getEffectiveContainerId(item) === containerId);
  }

  /**
   * Retourne les items racine de l'inventaire.
   */
  getRootInventoryItems() {
    return this.items.filter(item => !this.getEffectiveContainerId(item));
  }

  /**
   * Construit une map de noeuds runtime pour l'inventaire.
   * Chaque noeud contient :
   * - item
   * - id
   * - children
   */
  _buildInventoryNodeMap() {
    const map = new Map();

    for (const item of this.items) {
      map.set(item.id, {
        id: item.id,
        item,
        children: []
      });
    }

    for (const node of map.values()) {
      const parentId = this.getEffectiveContainerId(node.item);
      if (parentId && map.has(parentId)) {
        map.get(parentId).children.push(node);
      }
    }

    return map;
  }

  /**
   * Retourne un arbre runtime complet de l'inventaire.
   * Pratique pour la feuille acteur.
   */
  getInventoryTree() {
    const map = this._buildInventoryNodeMap();

    const toTreeNode = (node, depth = 0) => {
      const item = node.item;
      return {
        ...item.toObject(),
        id: item.id,
        name: item.name,
        img: item.img,
        system: item.system,
        containerId: this.getEffectiveContainerId(item),
        expanded: !!item.system.expanded,
        depth,
        contents: node.children.map(child => toTreeNode(child, depth + 1))
      };
    };

    return Array.from(map.values())
      .filter(node => !this.getEffectiveContainerId(node.item))
      .map(node => toTreeNode(node, 0));
  }

  /**
   * Retourne le sous-arbre runtime d'un conteneur.
   * Pratique pour la future fiche item conteneur.
   */
  getContainerTree(containerId) {
    const map = this._buildInventoryNodeMap();
    const root = map.get(containerId);
    if (!root) return [];

    const toTreeNode = (node, depth = 0) => {
      const item = node.item;
      return {
        ...item.toObject(),
        id: item.id,
        name: item.name,
        img: item.img,
        system: item.system,
        containerId: this.getEffectiveContainerId(item),
        expanded: !!item.system.expanded,
        depth,
        contents: node.children.map(child => toTreeNode(child, depth + 1))
      };
    };

    return root.children.map(child => toTreeNode(child, 0));
  }

  /**
   * Retourne tous les descendants d'un conteneur.
   */
  getContainerDescendants(containerId) {
    const map = this._buildInventoryNodeMap();
    const root = map.get(containerId);
    if (!root) return [];

    const results = [];

    const walk = (node) => {
      for (const child of node.children) {
        results.push(child.item);
        walk(child);
      }
    };

    walk(root);
    return results;
  }

  /* -------------------------------------------- */
  /* POIDS / CAPACITÉ                             */
  /* -------------------------------------------- */

  /**
   * Poids du contenu direct + récursif d'un conteneur,
   * sans compter le poids vide du conteneur lui-même.
   */
  getContainerContentWeight(containerId) {
    const item = this.getInventoryItem(containerId);
    if (!item || !item.system.isContainer) return 0;

    const map = this._buildInventoryNodeMap();
    const node = map.get(containerId);
    if (!node) return 0;

    const computeNodeWeight = (nodeToCompute) => {
      const system = nodeToCompute.item.system;
      const quantity = system.isContainer
        ? 1
        : Math.max(1, Number(system.quantity ?? 1));
      const unitWeight = Number(system.unitWeight ?? 0);
      const emptyWeight = Number(system.emptyWeight ?? 0);

      const baseWeight = system.isContainer ? emptyWeight : unitWeight;
      let childrenWeight = 0;

      for (const child of nodeToCompute.children) {
        childrenWeight += computeNodeWeight(child);
      }

      return (baseWeight + childrenWeight) * quantity;
    };

    let total = 0;
    for (const child of node.children) {
      total += computeNodeWeight(child);
    }

    return Math.round(total * 100) / 100;
  }

  /**
   * Retourne l'état runtime d'un conteneur :
   * - poids du contenu
   * - poids total
   * - capacité
   * - surcharge
   */
  getContainerState(containerId) {
    const item = this.getInventoryItem(containerId);
    if (!item || !item.system.isContainer) {
      return {
        contentWeight: 0,
        totalWeight: 0,
        capacityWeight: 0,
        overweight: false
      };
    }

    const contentWeight = this.getContainerContentWeight(containerId);
    const totalWeight = Number(item.system.weight ?? 0);
    const capacityWeight = Number(item.system.capacityWeight ?? 0);
    const overweight = capacityWeight > 0 ? contentWeight > capacityWeight : false;

    return {
      contentWeight: Math.round(contentWeight * 100) / 100,
      totalWeight: Math.round(totalWeight * 100) / 100,
      capacityWeight: Math.round(capacityWeight * 100) / 100,
      overweight
    };
  }

  /**
   * Poids total porté par l'acteur :
   * on additionne seulement les items racine
   * pour éviter de compter deux fois le contenu
   * des conteneurs.
   *
   * Cette méthode devient la source unique
   * du poids récursif des conteneurs.
   */
  _prepareInventoryTotals() {
    const map = this._buildInventoryNodeMap();

    const computeWeight = (node) => {
      const system = node.item.system;

      const quantity = system.isContainer
        ? 1
        : Math.max(1, Number(system.quantity ?? 1));

      const unitWeight = Number(system.unitWeight ?? 0);
      const emptyWeight = Number(system.emptyWeight ?? 0);
      const capacityWeight = Number(system.capacityWeight ?? 0);

      // Poids de base :
      // - item simple => poids unitaire
      // - conteneur => poids vide
      const baseWeight = system.isContainer ? emptyWeight : unitWeight;

      // Poids récursif des enfants
      let childrenWeight = 0;
      for (const child of node.children) {
        childrenWeight += computeWeight(child);
      }

      // Un conteneur ne se stacke pas ; un item simple oui.
      const total = system.isContainer
        ? Math.round((baseWeight + childrenWeight) * 100) / 100
        : Math.round((baseWeight + childrenWeight) * quantity * 100) / 100;

      // Le poids stocké sur la ligne = poids total réel de ce nœud
      system.weight = total;

      // Surcharge d’un conteneur = poids de son contenu > capacité max
      if (system.isContainer && capacityWeight > 0) {
        system.overweight = childrenWeight > capacityWeight;
      } else {
        system.overweight = false;
      }

      return total;
    };

    let totalWeight = 0;

    // On additionne uniquement les racines pour éviter
    // de compter deux fois les enfants des conteneurs.
    for (const node of map.values()) {
      if (!this.getEffectiveContainerId(node.item)) {
        totalWeight += computeWeight(node);
      }
    }

    this.system.totalWeight = Math.round(totalWeight * 100) / 100;
  }

  _prepareEncumbrance() {
    const strength = Number(this.system.attributes?.force ?? 0);
    const capacity = Math.round((strength / 2) * 100) / 100;
    const total = Number(this.system.totalWeight ?? 0);

    this.system.capacity = capacity;
    this.system.overburdened = total > capacity;
  }

  /* -------------------------------------------- */
  /* VALIDATION DE DÉPLACEMENT                    */
  /* -------------------------------------------- */

  /**
   * Vérifie si targetContainerId est un conteneur valide pour itemId.
   */
  canMoveItemToContainer(itemId, targetContainerId) {
    const item = this.getInventoryItem(itemId);
    if (!item) {
      return {
        valid: false,
        reason: "Item introuvable."
      };
    }

    if (!targetContainerId) {
      return {
        valid: true,
        reason: null
      };
    }

    const target = this.getInventoryItem(targetContainerId);
    if (!target) {
      return {
        valid: false,
        reason: "Conteneur cible introuvable."
      };
    }

    if (!target.system.isContainer) {
      return {
        valid: false,
        reason: "La cible n'est pas un conteneur."
      };
    }

    if (item.id === target.id) {
      return {
        valid: false,
        reason: "Un conteneur ne peut pas être placé dans lui-même."
      };
    }

    const descendants = this.getContainerDescendants(item.id).map(child => child.id);
    if (descendants.includes(target.id)) {
      return {
        valid: false,
        reason: "Déplacement impossible : boucle parent/enfant."
      };
    }

    const targetCapacity = Number(target.system.capacityWeight ?? 0);
    if (targetCapacity > 0) {
      const targetContentWeight = this.getContainerContentWeight(target.id);
      const itemWeight = Number(item.system.weight ?? 0);

      if ((targetContentWeight + itemWeight) > targetCapacity) {
        return {
          valid: false,
          reason: "Capacité du conteneur dépassée."
        };
      }
    }

    return {
      valid: true,
      reason: null
    };
  }

  /* -------------------------------------------- */
  /* ACTIONS MÉTIER INVENTAIRE                    */
  /* -------------------------------------------- */

  /**
   * Déplace un item dans un conteneur (ou à la racine si null).
   */
  async moveItemToContainer(itemId, targetContainerId = null) {
    const item = this.getInventoryItem(itemId);
    if (!item) return false;

    const validation = this.canMoveItemToContainer(itemId, targetContainerId);
    if (!validation.valid) {
      ui.notifications?.warn(validation.reason);
      return false;
    }

    await item.update({
      "system.containerId": targetContainerId,
      "system.container": targetContainerId
    });

    return true;
  }

  /**
   * Sort un item de son conteneur actuel.
   */
  async extractItemFromContainer(itemId) {
    return this.moveItemToContainer(itemId, null);
  }

  /**
   * Supprime un item de l'inventaire.
   */
  async deleteInventoryItem(itemId) {
    const item = this.getInventoryItem(itemId);
    if (!item) return false;

    await this.deleteEmbeddedDocuments("Item", [itemId]);
    return true;
  }

  /**
   * Met à jour la quantité d'un item.
   * Si la quantité tombe à 0, l'item est supprimé.
   */
  async updateInventoryItemQuantity(itemId, quantity) {
    const item = this.getInventoryItem ? this.getInventoryItem(itemId) : this.items.get(itemId);
    if (!item) return false;

    if (item.system?.isContainer) {
      await item.update({ "system.quantity": 1 });
      return true;
    }

    const normalizedQuantity = Math.max(0, Math.floor(Number(quantity) || 0));

    if (normalizedQuantity <= 0) {
      await this.deleteEmbeddedDocuments("Item", [itemId]);
      return true;
    }

    await item.update({
      "system.quantity": normalizedQuantity
    });

    return true;
  }

  /**
   * Ouvre / ferme un conteneur dans l'UI.
   */
  async toggleContainerExpanded(containerId, expanded = null) {
    const item = this.getInventoryItem(containerId);
    if (!item || !item.system.isContainer) return false;

    const nextExpanded = expanded ?? !item.system.expanded;

    await item.update({
      "system.expanded": !!nextExpanded
    });

    return true;
  }

  /**
   * Détermine si deux items peuvent être fusionnés en pile.
   */
  areItemsStackable(itemA, itemB) {
    if (!itemA || !itemB) return false;
    if (itemA.system?.isContainer || itemB.system?.isContainer) return false;

    return (
      itemA.name === itemB.name &&
      (itemA.system?.category ?? "") === (itemB.system?.category ?? "") &&
      Number(itemA.system?.unitWeight ?? 0) === Number(itemB.system?.unitWeight ?? 0) &&
      itemA.img === itemB.img
    );
  }

  async tryStackItems(sourceItemId, targetItemId) {
    const source = this.getInventoryItem(sourceItemId);
    const target = this.getInventoryItem(targetItemId);

    if (!this.areItemsStackable(source, target)) return false;

    const newQty =
      Number(target.system?.quantity ?? 0) +
      Number(source.system?.quantity ?? 0);

    await target.update({ "system.quantity": newQty });
    await this.deleteInventoryItem(source.id);

    return true;
  }

  async tryStackOrMoveItem(sourceItemId, targetItemId = null, targetContainerId = null) {
    const source = this.getInventoryItem(sourceItemId);
    if (!source) return false;

    if (targetItemId) {
      const stacked = await this.tryStackItems(sourceItemId, targetItemId);
      if (stacked) return true;
    }

    return this.moveItemToContainer(sourceItemId, targetContainerId);
  }

  /* -------------------------------------------- */
  /* ROLL                                         */
  /* -------------------------------------------- */

  async rollAttribute(attributeKey) {
    const attributeValue = Number(this.system.attributes?.[attributeKey] ?? 0);

    const labels = {
      corpsacorps: "Corps-à-corps",
      capacitedetir: "Capacité de tir",
      force: "Force",
      agilite: "Agilité",
      intelligence: "Intelligence",
      perception: "Perception",
      stress: "Stress"
    };

    const roll = await (new Roll("1d100")).evaluate();
    const result = roll.total;

    let outcome = "Échec";
    if (result <= 5) outcome = "Réussite Critique";
    else if (result <= attributeValue) outcome = "Réussite";
    else if (result >= 96) outcome = "Échec Critique";

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${labels[attributeKey] ?? attributeKey} (${attributeValue}%) → ${outcome}`
    });
  }
}