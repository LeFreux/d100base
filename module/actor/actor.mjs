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
      ui.notifications?.warn(
        this.localize("D100BASE.Errors.InvalidLocalizedWoundPart", "Membre invalide.")
      );
      return false;
    }

    if (!this.isValidLocalizedWoundState(stateKey)) {
      ui.notifications?.warn(
        this.localize("D100BASE.Errors.InvalidLocalizedWoundState", "État de blessure invalide.")
      );
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
   * Indique si un item peut être transféré comme racine d'un sous-arbre.
   */
  isTransferableInventoryItem(itemOrId) {
    const item = typeof itemOrId === "string" ? this.getInventoryItem(itemOrId) : itemOrId;
    return !!item;
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

  /**
   * Retourne le sous-arbre runtime complet d'un item racine
   * (item simple ou conteneur).
   */
  getInventorySubtree(itemId) {
    const map = this._buildInventoryNodeMap();
    const root = map.get(itemId);
    if (!root) return null;

    const toSubtreeNode = (node) => {
      const item = node.item;

      return {
        id: item.id,
        item,
        data: item.toObject(),
        children: node.children.map(child => toSubtreeNode(child))
      };
    };

    return toSubtreeNode(root);
  }

  /**
   * Retourne tous les items d'un sous-arbre, racine incluse.
   */
  flattenInventorySubtree(subtree) {
    if (!subtree) return [];

    const results = [];

    const walk = (node) => {
      results.push(node);
      for (const child of node.children) {
        walk(child);
      }
    };

    walk(subtree);
    return results;
  }

  /**
   * Retourne le poids total d'un sous-arbre.
   * On lit le poids runtime déjà préparé sur chaque item racine.
   */
  getInventorySubtreeWeight(itemId) {
    const item = this.getInventoryItem(itemId);
    if (!item) return 0;

    return Math.round(Number(item.system?.weight ?? 0) * 100) / 100;
  }

  /**
   * Teste si un acteur cible accorde au moins un certain niveau de permission
   * à l'utilisateur courant.
   */
  hasMinimumTransferPermissionForUser(
    targetActor,
    user = game.user,
    minimumLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED
  ) {
    if (!targetActor || !user) return false;
    return targetActor.testUserPermission(user, minimumLevel);
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
        reason: this.localize("D100BASE.Errors.ItemNotFound", "Item introuvable.")
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
        reason: this.localize("D100BASE.Errors.TargetContainerNotFound", "Conteneur cible introuvable.")
      };
    }

    if (!target.system.isContainer) {
      return {
        valid: false,
        reason: this.localize("D100BASE.Errors.InvalidContainer", "La cible n'est pas un conteneur.")
      };
    }

    if (item.id === target.id) {
      return {
        valid: false,
        reason: this.localize("D100BASE.Errors.CannotContainSelf", "Un conteneur ne peut pas être placé dans lui-même.")
      };
    }

    const descendants = this.getContainerDescendants(item.id).map(child => child.id);
    if (descendants.includes(target.id)) {
      return {
        valid: false,
        reason: this.localize("D100BASE.Errors.ContainerLoop", "Déplacement impossible : boucle parent / enfant.")
      };
    }

    const targetCapacity = Number(target.system.capacityWeight ?? 0);
    if (targetCapacity > 0) {
      const targetContentWeight = this.getContainerContentWeight(target.id);
      const itemWeight = Number(item.system.weight ?? 0);

      if ((targetContentWeight + itemWeight) > targetCapacity) {
        return {
          valid: false,
          reason: this.localize("D100BASE.Errors.CapacityExceeded", "Capacité du conteneur dépassée.")
        };
      }
    }

    return {
      valid: true,
      reason: null
    };
  }

  /**
   * Vérifie si un transfert inter-acteurs est autorisé.
   * - targetActor : acteur cible
   * - itemId : item racine transféré
   * - targetContainerId : conteneur cible chez l'acteur cible (ou null = racine)
   */
  canTransferInventorySubtreeToActor(
    itemId,
    targetActor,
    targetContainerId = null
  ) {
    const item = this.getInventoryItem(itemId);

    if (!item) {
      return {
        valid: false,
        reason: this.localize("D100BASE.Errors.ItemNotFound", "Item introuvable.")
      };
    }

    if (!targetActor || !(targetActor instanceof Actor)) {
      return {
        valid: false,
        reason: this.localize("D100BASE.Inventory.TransferTargetNotFound", "Acteur cible introuvable.")
      };
    }

    if (targetActor.id === this.id) {
      return {
        valid: false,
        reason: this.localize("D100BASE.Errors.CannotTransferToSelf", "Le transfert vers le même acteur n'est pas autorisé.")
      };
    }

    if (!targetContainerId) {
      return {
        valid: true,
        reason: null
      };
    }

    const targetContainer = targetActor.getInventoryItem?.(targetContainerId) ?? null;

    if (!targetContainer) {
      return {
        valid: false,
        reason: this.localize("D100BASE.Errors.TargetContainerNotFound", "Conteneur cible introuvable.")
      };
    }

    if (!targetContainer.system?.isContainer) {
      return {
        valid: false,
        reason: this.localize("D100BASE.Errors.InvalidContainer", "La cible n'est pas un conteneur.")
      };
    }

    const targetCapacity = Number(targetContainer.system.capacityWeight ?? 0);
    if (targetCapacity > 0) {
      const targetContentWeight = Number(targetActor.getContainerContentWeight?.(targetContainer.id) ?? 0);
      const subtreeWeight = this.getInventorySubtreeWeight(itemId);

      if ((targetContentWeight + subtreeWeight) > targetCapacity) {
        return {
          valid: false,
          reason: this.localize("D100BASE.Errors.CapacityExceeded", "Capacité du conteneur dépassée.")
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
   * Prépare les données d'un item pour une recréation sur un autre acteur.
   * On retire les IDs Foundry et on force le nouveau parent runtime.
   */
  prepareItemDataForActorTransfer(itemData, targetContainerId = null) {
    const cloned = foundry.utils.deepClone(itemData);

    delete cloned._id;
    delete cloned.folder;
    delete cloned.sort;
    delete cloned.ownership;

    if (!cloned.system) {
      cloned.system = {};
    }

    cloned.system.containerId = targetContainerId;
    cloned.system.container = targetContainerId;

    if (cloned.system.isContainer) {
      cloned.system.quantity = 1;
    }

    return cloned;
  }

  /**
   * Recrée récursivement un sous-arbre d'inventaire chez l'acteur courant.
   * Retourne la liste des nouveaux items créés.
   */
  async createTransferredSubtree(subtreeNode, targetContainerId = null, createdItems = []) {
    if (!subtreeNode?.data) {
      throw new Error("D100 Base | Sous-arbre de transfert invalide.");
    }

    const itemData = this.prepareItemDataForActorTransfer(subtreeNode.data, targetContainerId);

    const created = await this.createEmbeddedDocuments("Item", [itemData]);
    const createdRoot = created?.[0] ?? null;

    if (!createdRoot) {
      throw new Error("D100 Base | Impossible de créer l'item racine transféré.");
    }

    createdItems.push(createdRoot);

    for (const child of (subtreeNode.children ?? [])) {
      await this.createTransferredSubtree(child, createdRoot.id, createdItems);
    }

    return createdItems;
  }

  /**
   * Transfère un item simple ou un conteneur complet vers un autre acteur.
   * Si targetContainerId est null, l'objet arrive à la racine de l'inventaire cible.
   */
  async transferInventoryItemToActor(
    itemId,
    targetActor,
    targetContainerId = null
  ) {
    const item = this.getInventoryItem(itemId);
    if (!item) {
      const reason = this.localize("D100BASE.Errors.ItemNotFound", "Item introuvable.");
      ui.notifications?.warn(reason);
      return {
        success: false,
        reason
      };
    }

    const validation = this.canTransferInventorySubtreeToActor(
      itemId,
      targetActor,
      targetContainerId
    );

    if (!validation.valid) {
      ui.notifications?.warn(validation.reason);
      return {
        success: false,
        reason: validation.reason
      };
    }

    const subtree = this.getInventorySubtree(itemId);
    if (!subtree) {
      const reason = this.localize("D100BASE.Errors.InventorySubtreeNotFound", "Sous-arbre d'inventaire introuvable.");
      ui.notifications?.warn(reason);
      return {
        success: false,
        reason
      };
    }

    const sourceNodes = this.flattenInventorySubtree(subtree);
    const sourceItemIds = sourceNodes.map(node => node.id);

    try {
      if (typeof targetActor.createTransferredSubtree !== "function") {
        throw new Error("D100 Base | La méthode targetActor.createTransferredSubtree est introuvable.");
      }

      const createdItems = await targetActor.createTransferredSubtree(subtree, targetContainerId);

      await this.deleteEmbeddedDocuments("Item", sourceItemIds);

      return {
        success: true,
        transferredRootItemId: itemId,
        sourceItemIds,
        createdItemIds: createdItems.map(created => created.id),
        targetActorId: targetActor.id,
        targetContainerId
      };
    } catch (err) {
      console.error("D100 Base | Erreur transfert inter-acteurs", err);

      const reason = this.localize(
        "D100BASE.Errors.InventoryTransferFailed",
        "Erreur pendant le transfert d'inventaire."
      );

      return {
        success: false,
        reason
      };
    }
  }

  /**
   * Version de confort : transfert vers la racine de l'inventaire cible.
   */
  async transferInventoryItemToActorRoot(itemId, targetActor) {
    return this.transferInventoryItemToActor(itemId, targetActor, null);
  }

  /**
   * Méthode de compatibilité pour les appels legacy/proxy GM.
   *
   * Signature attendue par certaines parties du système :
   * transferInventoryToActor({
   *   targetActor,
   *   itemId,
   *   targetContainerId,
   *   transferAll
   * })
   *
   * Aujourd'hui, transferAll n'est pas utilisé : le transfert porte déjà
   * sur tout le sous-arbre de l'item racine demandé.
   */
  async transferInventoryToActor({
    targetActor,
    itemId,
    targetContainerId = null,
    transferAll = true
  } = {}) {
    if (!itemId) {
      const reason = this.localize("D100BASE.Errors.ItemNotFound", "Item introuvable.");
      return {
        success: false,
        reason
      };
    }

    void transferAll; // compat legacy : non utilisé pour l’instant

    return this.transferInventoryItemToActor(
      itemId,
      targetActor,
      targetContainerId
    );
  }

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
  /* JETS D100 / INITIATIVE                       */
  /* -------------------------------------------- */

  /**
   * Localise une clé avec fallback.
   */
  localize(key, fallback = "") {
    const localized = game.i18n?.localize?.(key);
    if (localized && localized !== key) {
      return localized;
    }

    return fallback || key;
  }

  /**
   * Formate une clé i18n avec fallback.
   */
  format(key, data = {}, fallback = "") {
    const formatted = game.i18n?.format?.(key, data);
    if (formatted && formatted !== key) {
      return formatted;
    }

    return fallback || key;
  }

  /**
   * Retourne le libellé localisé d’un attribut.
   */
  getAttributeLabel(attributeKey) {
    const fallbackLabels = {
      corpsacorps: "Corps-à-corps",
      capacitedetir: "Capacité de tir",
      force: "Force",
      agilite: "Agilité",
      intelligence: "Intelligence",
      perception: "Perception",
      stress: "Stress"
    };

    return this.localize(
      `D100BASE.Attributes.${attributeKey}`,
      fallbackLabels[attributeKey] ?? attributeKey
    );
  }

  /**
   * Retourne le libellé court localisé d’un attribut.
   */
  getAttributeShortLabel(attributeKey) {
    const fallbackShortLabels = {
      corpsacorps: "CC",
      capacitedetir: "CT",
      force: "F",
      agilite: "A",
      intelligence: "I",
      perception: "P",
      stress: "S"
    };

    return this.localize(
      `D100BASE.AttributesShort.${attributeKey}`,
      fallbackShortLabels[attributeKey] ?? attributeKey
    );
  }

  /**
   * Retourne le libellé localisé du résultat d’un jet d100.
   */
  getD100OutcomeLabel(outcomeKey) {
    const localizationMap = {
      "critical-success": "D100BASE.Roll.CriticalSuccess",
      success: "D100BASE.Roll.Success",
      failure: "D100BASE.Roll.Failure",
      "critical-failure": "D100BASE.Roll.CriticalFailure"
    };

    const fallbackMap = {
      "critical-success": "Réussite critique",
      success: "Réussite",
      failure: "Échec",
      "critical-failure": "Échec critique"
    };

    const key = localizationMap[outcomeKey];
    const fallback = fallbackMap[outcomeKey] ?? outcomeKey;

    return key ? this.localize(key, fallback) : fallback;
  }

  /**
   * Indique si Dice So Nice est disponible.
   */
  hasDiceSoNice() {
    return !!game.dice3d?.showForRoll;
  }

  /**
   * Affiche un roll via Dice So Nice si le module est disponible.
   */
  async showDiceSoNiceForRoll(roll) {
    if (!roll || !this.hasDiceSoNice()) return;

    try {
      await game.dice3d.showForRoll(roll, game.user, true);
    } catch (err) {
      console.warn("D100 Base | Impossible d'afficher le roll dans Dice So Nice", err);
    }
  }

  /**
   * Affiche le ou les rolls d’un check dans Dice So Nice.
   * En avantage / désavantage, on affiche les deux jets.
   */
  async showDiceSoNiceForCheckResult(checkResult) {
    if (!checkResult || !this.hasDiceSoNice()) return;

    const rollsToShow = [];

    if (checkResult.firstRoll) rollsToShow.push(checkResult.firstRoll);

    if (
      checkResult.secondRoll &&
      checkResult.secondRoll !== checkResult.firstRoll
    ) {
      rollsToShow.push(checkResult.secondRoll);
    }

    if (!rollsToShow.length && checkResult.roll) {
      rollsToShow.push(checkResult.roll);
    }

    for (const roll of rollsToShow) {
      await this.showDiceSoNiceForRoll(roll);
    }
  }

  /**
   * Affiche uniquement le jet écarté dans Dice So Nice.
   * Le jet retenu, lui, est déjà affiché automatiquement via le ChatMessage.
   */
  async showDiceSoNiceDiscardedRoll(checkResult) {
    if (!checkResult || !this.hasDiceSoNice()) return;

    const discardedRoll = checkResult.discardedRoll ?? null;
    if (!discardedRoll) return;

    await this.showDiceSoNiceForRoll(discardedRoll);
  }

  /**
   * Crée un message de chat custom en attachant explicitement le Roll.
   * Cela permet à Foundry et aux modules comme Dice So Nice de reconnaître
   * le message comme porteur d’un vrai jet.
   */
  async createCustomRollMessage({ speaker, roll, content }) {
    const chatData = {
      speaker,
      content,
      rolls: roll ? [roll] : []
    };

    const rollMode = game.settings?.get("core", "rollMode");
    ChatMessage.applyRollMode(chatData, rollMode);

    return ChatMessage.create(chatData);
  }

  /**
   * Évalue un jet d100 contre une valeur cible.
   *
   * Options :
   * - modifier :
   *   bonus  => stat augmentée
   *   malus  => stat baissée
   * - mode :
   *   "normal" | "advantage" | "disadvantage"
   *
   * Règles critiques :
   * - 1 à 5    = réussite critique
   * - 96 à 100 = échec critique
   */
  async evaluateD100Check(targetValue, {
    rollFormula = "1d100",
    criticalSuccessMax = 5,
    criticalFailureMin = 96,
    modifier = 0,
    mode = "normal"
  } = {}) {
    const baseTarget = Math.max(0, Number(targetValue ?? 0));
    const normalizedModifier = Number(modifier ?? 0) || 0;

    // Bonus => stat augmentée ; Malus => stat baissée
    const modifiedTarget = Math.max(0, baseTarget + normalizedModifier);

    const normalizedMode = ["normal", "advantage", "disadvantage"].includes(mode)
      ? mode
      : "normal";

    const firstRoll = await (new Roll(rollFormula)).evaluate();
    let secondRoll = null;
    let keptRoll = firstRoll;
    let discardedRoll = null;

    if (normalizedMode === "advantage" || normalizedMode === "disadvantage") {
      secondRoll = await (new Roll(rollFormula)).evaluate();

      const firstTotal = Number(firstRoll.total ?? 0);
      const secondTotal = Number(secondRoll.total ?? 0);

      // En roll-under, "meilleur" = plus petit résultat
      if (normalizedMode === "advantage") {
        keptRoll = firstTotal <= secondTotal ? firstRoll : secondRoll;
        discardedRoll = keptRoll === firstRoll ? secondRoll : firstRoll;
      } else {
        keptRoll = firstTotal >= secondTotal ? firstRoll : secondRoll;
        discardedRoll = keptRoll === firstRoll ? secondRoll : firstRoll;
      }
    }

    const result = Number(keptRoll.total ?? 0);

    const isCriticalSuccess = result >= 1 && result <= criticalSuccessMax;
    const isCriticalFailure = result >= criticalFailureMin && result <= 100;

    const isSuccess = !isCriticalFailure && (isCriticalSuccess || result <= modifiedTarget);
    const isFailure = !isSuccess;

    let outcomeKey = "failure";

    if (isCriticalSuccess) {
      outcomeKey = "critical-success";
    } else if (isCriticalFailure) {
      outcomeKey = "critical-failure";
    } else if (isSuccess) {
      outcomeKey = "success";
    }

    return {
      roll: keptRoll,
      firstRoll,
      secondRoll,
      keptRoll,
      discardedRoll,
      result,
      baseTarget,
      target: modifiedTarget,
      modifiedTarget,
      modifier: normalizedModifier,
      hasModifier: normalizedModifier !== 0,
      mode: normalizedMode,
      hasAdvantage: normalizedMode === "advantage",
      hasDisadvantage: normalizedMode === "disadvantage",
      margin: modifiedTarget - result,
      isSuccess,
      isFailure,
      isCriticalSuccess,
      isCriticalFailure,
      outcomeKey,
      outcomeLabel: this.getD100OutcomeLabel(outcomeKey)
    };
  }

  /**
   * Retourne le libellé de mode de jet.
   */
  getRollModeLabel(mode) {
    switch (mode) {
      case "advantage":
        return "Avantage";
      case "disadvantage":
        return "Désavantage";
      default:
        return "Normal";
    }
  }

  /**
   * Retourne la classe CSS d’état pour la carte de jet.
   */
  getRollOutcomeCssClass(resultLike) {
    if (!resultLike) return "is-failure";

    if (resultLike.isCriticalSuccess || resultLike.outcomeKey === "critical-success") {
      return "is-critical-success";
    }

    if (resultLike.isCriticalFailure || resultLike.outcomeKey === "critical-failure") {
      return "is-critical-failure";
    }

    if (resultLike.isSuccess || resultLike.outcomeKey === "success") {
      return "is-success";
    }

    return "is-failure";
  }

  /**
   * Formate une valeur signée.
   */
  formatSignedValue(value, suffix = "") {
    const number = Number(value ?? 0) || 0;
    if (number > 0) return `+${number}${suffix}`;
    return `${number}${suffix}`;
  }

  /**
   * Rend une carte de jet d100 via le template partagé.
   */
  async renderD100RollCard(templateData = {}) {
    const templatePath = "systems/d100base/templates/partials/chat-d100-roll.hbs";
    return renderTemplate(templatePath, templateData);
  }

  /**
   * Prépare les données communes au template de carte de jet.
   */
  buildCommonRollCardData({
    title,
    kicker = "Jet",
    cardClass = "",
    mode = "normal",
    baseTarget = 0,
    modifiedTarget = 0,
    modifier = 0,
    result = 0,
    firstRoll = null,
    secondRoll = null,
    margin = 0,
    outcomeKey = "",
    outcomeLabel = "",
    extraRows = []
  } = {}) {
    return {
      title,
      kicker,
      cardClass,

      mode,
      modeLabel: this.getRollModeLabel(mode),

      baseTarget,
      modifiedTarget,
      modifier,
      modifierSigned: this.formatSignedValue(modifier),
      hasModifier: Number(modifier ?? 0) !== 0,

      result,
      firstRoll,
      secondRoll,

      margin,
      marginSigned: this.formatSignedValue(margin),

      outcomeKey,
      outcomeLabel,
      outcomeClass: this.getRollOutcomeCssClass({ outcomeKey }),

      extraRows
    };
  }

  /**
   * Construit le contenu chat HTML pour un jet d’attribut.
   */
  async buildAttributeRollFlavor(attributeKey, checkResult) {
    const data = this.buildCommonRollCardData({
      title: this.getAttributeLabel(attributeKey),
      kicker: "Jet d’attribut",
      cardClass: "d100base-chat-card-attribute",

      mode: checkResult.mode,
      baseTarget: checkResult.baseTarget,
      modifiedTarget: checkResult.modifiedTarget,
      modifier: checkResult.modifier,

      result: checkResult.result,
      firstRoll: checkResult.firstRoll?.total ?? null,
      secondRoll: checkResult.secondRoll?.total ?? null,

      margin: checkResult.margin,
      outcomeKey: checkResult.outcomeKey,
      outcomeLabel: checkResult.outcomeLabel
    });

    return this.renderD100RollCard(data);
  }

  /**
   * Construit le contenu chat HTML pour un jet d’initiative
   * en réutilisant le même template générique.
   */
  async buildInitiativeFlavor(initiativeResult) {
    const extraRows = [
      {
        label: "Agilité",
        value: initiativeResult.agility
      },
      {
        label: "Initiative",
        value: initiativeResult.finalInitiative
      }
    ];

    if (initiativeResult.criticalInitiativeModifier !== 0) {
      const modifierLabel = initiativeResult.criticalInitiativeModifier > 0
        ? this.format(
            "D100BASE.Initiative.CriticalBonus",
            { value: initiativeResult.criticalInitiativeModifier },
            `Bonus critique : +${initiativeResult.criticalInitiativeModifier}`
          )
        : this.format(
            "D100BASE.Initiative.CriticalPenalty",
            { value: initiativeResult.criticalInitiativeModifier },
            `Malus critique : ${initiativeResult.criticalInitiativeModifier}`
          );

      extraRows.push({
        label: "Critique",
        value: modifierLabel
      });
    }

    const data = this.buildCommonRollCardData({
      title: this.localize("D100BASE.Initiative.Title", "Initiative"),
      kicker: "Jet d’initiative",
      cardClass: "d100base-chat-card-initiative",

      mode: initiativeResult.mode,
      baseTarget: initiativeResult.baseTarget,
      modifiedTarget: initiativeResult.modifiedTarget,
      modifier: initiativeResult.modifier,

      result: initiativeResult.result,
      firstRoll: initiativeResult.firstRoll?.total ?? null,
      secondRoll: initiativeResult.secondRoll?.total ?? null,

      margin: initiativeResult.margin,
      outcomeKey: initiativeResult.outcomeKey,
      outcomeLabel: initiativeResult.outcomeLabel,

      extraRows
    });

    return this.renderD100RollCard(data);
  }

  /**
   * Extrait un tokenId à partir d’un contexte souple :
   * - Token
   * - TokenDocument
   * - string (id direct)
   * - objet contenant tokenId
   */
  getTokenIdFromContext(tokenContext = null) {
    if (!tokenContext) return null;

    if (typeof tokenContext === "string") {
      return tokenContext;
    }

    if (tokenContext.tokenId) {
      return tokenContext.tokenId;
    }

    if (tokenContext.document?.id) {
      return tokenContext.document.id;
    }

    if (tokenContext.id) {
      return tokenContext.id;
    }

    return null;
  }

  /**
   * Retourne tous les combatants du combat actif liés à cet acteur.
   */
  getActiveCombatantsForActor() {
    const combat = game.combats?.active;
    if (!combat) return [];

    return combat.combatants.filter(combatant => combatant.actorId === this.id);
  }

  /**
   * Retourne le combatant correspondant à un token précis.
   */
  getCombatantByTokenId(tokenId) {
    const combat = game.combats?.active;
    if (!combat || !tokenId) return null;

    return combat.combatants.find(combatant => combatant.tokenId === tokenId) ?? null;
  }

  /**
   * Résout le combatant cible pour une action liée à une instance d’acteur.
   *
   * Priorité :
   * 1. tokenId explicite
   * 2. un seul combatant pour cet acteur
   * 3. null si ambigu
   */
  resolveCombatant(tokenContext = null) {
    const tokenId = this.getTokenIdFromContext(tokenContext);

    if (tokenId) {
      return this.getCombatantByTokenId(tokenId);
    }

    const actorCombatants = this.getActiveCombatantsForActor();

    if (actorCombatants.length === 1) {
      return actorCombatants[0];
    }

    return null;
  }

  /**
   * Lance l’initiative à partir de l’Agilité :
   * initiative = Agilité - jet
   * +50 si réussite critique
   * -30 si échec critique
   *
   * Options :
   * - token
   * - modifier
   * - mode ("normal" | "advantage" | "disadvantage")
   */
  async rollInitiative({
    token = null,
    modifier = 0,
    mode = "normal"
  } = {}) {
    const agility = Number(this.system.attributes?.agilite ?? 0);

    const checkResult = await this.evaluateD100Check(agility, {
      modifier,
      mode
    });

    let criticalInitiativeModifier = 0;
    if (checkResult.isCriticalSuccess) criticalInitiativeModifier = 50;
    else if (checkResult.isCriticalFailure) criticalInitiativeModifier = -30;

    const baseInitiative = checkResult.modifiedTarget - checkResult.result;
    const finalInitiative = baseInitiative + criticalInitiativeModifier;

    const initiativeResult = {
      ...checkResult,
      agility,
      baseInitiative,
      criticalInitiativeModifier,
      finalInitiative,
      tokenId: this.getTokenIdFromContext(token),
      combatantId: null
    };

    const combat = game.combats?.active;
    const combatant = this.resolveCombatant(token);

    if (combatant) {
      initiativeResult.combatantId = combatant.id;
    }

    if (!combat) {
      ui.notifications?.warn(
        this.localize("D100BASE.Initiative.NoActiveCombat", "Aucun combat actif.")
      );
    } else if (!combatant) {
      const actorCombatants = this.getActiveCombatantsForActor();

      if (actorCombatants.length > 1 && !initiativeResult.tokenId) {
        ui.notifications?.warn(
          this.localize(
            "D100BASE.Initiative.AmbiguousCombatant",
            "Plusieurs instances de cet acteur sont présentes dans le combat. Lancez l’initiative depuis le token concerné."
          )
        );
      } else {
        ui.notifications?.warn(
          this.localize(
            "D100BASE.Initiative.MissingCombatant",
            "Aucun combatant correspondant trouvé pour cette initiative."
          )
        );
      }
    } else {
      const setInitiative = game.d100base?.setCombatantInitiative;

      if (typeof setInitiative === "function") {
        await setInitiative(combatant, finalInitiative);
      } else {
        await combat.setInitiative(combatant.id, finalInitiative);
      }
    }

    const content = await this.buildInitiativeFlavor(initiativeResult);

    await this.createCustomRollMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      roll: checkResult.keptRoll,
      content
    });

    await this.showDiceSoNiceDiscardedRoll(checkResult);

    return initiativeResult;
  }

  /* -------------------------------------------- */
  /* ROLL                                         */
  /* -------------------------------------------- */

  async rollAttribute(attributeKey, {
    modifier = 0,
    mode = "normal"
  } = {}) {
    const attributeValue = Number(this.system.attributes?.[attributeKey] ?? 0);

    const checkResult = await this.evaluateD100Check(attributeValue, {
      modifier,
      mode
    });

    const content = await this.buildAttributeRollFlavor(attributeKey, checkResult);

    await this.createCustomRollMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      roll: checkResult.keptRoll,
      content
    });

    await this.showDiceSoNiceDiscardedRoll(checkResult);

    return checkResult;
  }
}