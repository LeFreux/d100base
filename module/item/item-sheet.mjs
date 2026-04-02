export class D100ItemSheet extends ItemSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["d100base", "sheet", "item"],
      width: 620,
      height: 620,
      dragDrop: [{ dropSelector: ".container-contents-runtime" }]
    });
  }

  get template() {
    return "systems/d100base/templates/item-sheet.hbs";
  }

  /* ===================================== */
  /* HELPERS                               */
  /* ===================================== */

  get actor() {
    return this.item.parent instanceof Actor ? this.item.parent : null;
  }

  get isOwnedItem() {
    return !!this.actor;
  }

  get isOwnedContainer() {
    return this.isOwnedItem && !!this.item.system?.isContainer;
  }

  _getPermissionContext() {
    return {
      isOwner: this.item.isOwner,
      isObserver: !this.item.isOwner && this.item.testUserPermission(game.user, "OBSERVER"),
      isLimited: this.item.limited,
      isEditable: this.isEditable
    };
  }

  _getCategories() {
    return [
      { value: "Arme", label: "Arme" },
      { value: "Artisanal", label: "Artisanal" },
      { value: "Conteneur", label: "Conteneur" },
      { value: "Divers", label: "Divers" },
      { value: "Drogue", label: "Drogue" },
      { value: "Électronique", label: "Électronique" },
      { value: "Livre", label: "Livre" },
      { value: "Loisir", label: "Loisir" },
      { value: "Lumière", label: "Lumière" },
      { value: "Matériau", label: "Matériau" },
      { value: "Munition", label: "Munition" },
      { value: "Médical", label: "Médical" },
      { value: "Nourriture", label: "Nourriture" },
      { value: "Outil", label: "Outil" },
      { value: "Protection", label: "Protection" },
      { value: "Quincaillerie", label: "Quincaillerie" },
      { value: "Vêtement", label: "Vêtement" }
    ];
  }

  _roundWeight(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  /**
   * Retourne un aperçu de poids pour les items non possédés.
   * Pour les conteneurs possédés, le vrai poids vient de l’acteur.
   */
  _getStandaloneWeightState() {
    const system = this.item.system;
    const quantity = system.isContainer
      ? 1
      : Math.max(0, Number(system.quantity ?? 1));
    const unitWeight = Math.max(0, Number(system.unitWeight ?? 0));
    const emptyWeight = Math.max(0, Number(system.emptyWeight ?? 0));
    const capacityWeight = Math.max(0, Number(system.capacityWeight ?? 0));

    if (!system.isContainer) {
      return {
        contentWeight: 0,
        totalWeight: this._roundWeight(unitWeight * quantity),
        emptyWeight: 0,
        capacityWeight,
        overweight: false
      };
    }

    return {
      contentWeight: 0,
      totalWeight: this._roundWeight(emptyWeight * quantity),
      emptyWeight: this._roundWeight(emptyWeight),
      capacityWeight: this._roundWeight(capacityWeight),
      overweight: false
    };
  }

  /**
   * Retourne un état runtime complet pour un conteneur possédé.
   */
  _getOwnedContainerState() {
    if (!this.isOwnedContainer) {
      return this._getStandaloneWeightState();
    }

    return this.actor.getContainerState(this.item.id);
  }

  /**
   * Retourne l’arbre réel du contenu d’un conteneur possédé.
   */
  _getOwnedContainerTree() {
    if (!this.isOwnedContainer) return [];
    return this.actor.getContainerTree(this.item.id);
  }

  _getItemIdFromEventTarget(target) {
    return target?.closest?.(".item")?.dataset?.itemId ?? null;
  }

  _getDragTransfer(event) {
    return event.originalEvent?.dataTransfer || event.dataTransfer || null;
  }

  _getDraggedItemIdFromEvent(event) {
    const dt = this._getDragTransfer(event);
    if (!dt) return null;

    const plain = dt.getData("text/plain");
    if (plain) return plain;

    return null;
  }

  _getTargetItemFromDropEvent(event) {
    const targetLi = event.currentTarget?.closest?.(".item") || event.currentTarget;
    const targetId = targetLi?.dataset?.itemId;
    if (!targetId || !this.actor) return null;

    return this.actor.getInventoryItem(targetId);
  }

  /**
   * Détermine le conteneur cible :
   * - drop sur le fond de la vue conteneur => ce conteneur
   * - drop sur un conteneur enfant => ce conteneur enfant
   * - drop sur un item simple => même conteneur que cet item
   */
  _resolveDropTargetContainerId(targetItem = null) {
    if (!this.isOwnedContainer) return null;

    if (!targetItem) {
      return this.item.id;
    }

    if (targetItem.system?.isContainer) {
      return targetItem.id;
    }

    return this.actor.getEffectiveContainerId(targetItem);
  }

  /**
   * Fusion simple conservée côté UI pour cohérence avec actor-sheet.
   */
  async _tryStackItems(draggedItem, targetItem) {
    if (!draggedItem || !targetItem) return false;
    if (draggedItem.system?.isContainer) return false;
    if (targetItem.system?.isContainer) return false;

    const draggedKey = `${draggedItem.name}::${draggedItem.system?.category ?? ""}`;
    const targetKey = `${targetItem.name}::${targetItem.system?.category ?? ""}`;

    if (draggedKey !== targetKey) return false;

    const newQty =
      Number(targetItem.system?.quantity ?? 0) +
      Number(draggedItem.system?.quantity ?? 0);

    await this.actor.updateInventoryItemQuantity(targetItem.id, newQty);
    await this.actor.deleteInventoryItem(draggedItem.id);

    return true;
  }

  async _handleRuntimeContainerDrop(event) {
    if (!this.isOwnedContainer) return;

    event.preventDefault();

    const draggedId = this._getDraggedItemIdFromEvent(event);
    let draggedItem = draggedId ? this.actor.getInventoryItem(draggedId) : null;

    /**
     * Support minimal de drop Foundry standard.
     * On n’accepte ici que les items déjà possédés par ce même acteur.
     */
    if (!draggedItem) {
      const data = TextEditor.getDragEventData(event);
      if (data?.type === "Item") {
        const droppedItem = await Item.fromDropData(data);
        if (droppedItem?.parent?.id === this.actor.id) {
          draggedItem = droppedItem;
        }
      }
    }

    if (!draggedItem) return;
    if (draggedItem.id === this.item.id) return;

    const targetItem = this._getTargetItemFromDropEvent(event);

    if (targetItem && draggedItem.id === targetItem.id) return;

    const targetContainerId = this._resolveDropTargetContainerId(targetItem);

    await this.actor.tryStackOrMoveItem(
      draggedItem.id,
      targetItem?.id ?? null,
      targetContainerId
    );
  }

  /* ===================================== */
  /* DATA                                  */
  /* ===================================== */

  getData() {
    const context = super.getData();

    context.system = this.item.system;
    context.categories = this._getCategories();
    context.permissions = this._getPermissionContext();

    context.isOwnedItem = this.isOwnedItem;
    context.isOwnedContainer = this.isOwnedContainer;

    const weightState = this.isOwnedContainer
      ? this._getOwnedContainerState()
      : this._getStandaloneWeightState();

    context.contentWeight = weightState.contentWeight;
    context.totalWeight = weightState.totalWeight;
    context.emptyWeight = weightState.emptyWeight;
    context.capacityWeight = weightState.capacityWeight;
    context.overweight = weightState.overweight;

    /**
     * Vue runtime réelle du contenu.
     * Utilisée par la future version de item-sheet.hbs.
     */
    context.containerTree = this._getOwnedContainerTree();

    return context;
  }

  /* ===================================== */
  /* POIDS LOCAL (ITEM NON CONTENEUR / NON POSSEDÉ) */
  /* ===================================== */

  /**
   * Recalcul local simple.
   * - item simple : unitWeight * quantity
   * - conteneur non possédé : emptyWeight * quantity
   *
   * Le poids réel d’un conteneur possédé vient de actor.mjs.
   */
  async _recalculateWeightFromForm(html) {
    const system = this.item.system;
    const quantity = system.isContainer
      ? 1
      : Math.max(0, Number(html.find('input[name="system.quantity"]').val()) || 0);

    if (!system.isContainer) {
      const unitWeight = Math.max(0, Number(html.find('input[name="system.unitWeight"]').val()) || 0);
      const totalWeight = this._roundWeight(unitWeight * quantity);

      await this.item.update({
        "system.quantity": quantity,
        "system.unitWeight": unitWeight,
        "system.weight": totalWeight
      });
      return;
    }

    const emptyWeight = Math.max(0, Number(html.find('input[name="system.emptyWeight"]').val()) || 0);

    /**
     * Pour un conteneur possédé, le poids total sera recalculé côté acteur.
     * Ici on met seulement à jour les champs directement édités.
     */
    if (this.isOwnedContainer) {
      await this.item.update({
        "system.quantity": 1,
        "system.emptyWeight": emptyWeight,
        "system.unitWeight": this._roundWeight(emptyWeight)
      });
      return;
    }

    const totalWeight = this._roundWeight(emptyWeight);

    await this.item.update({
      "system.quantity": 1,
      "system.emptyWeight": emptyWeight,
      "system.unitWeight": this._roundWeight(emptyWeight),
      "system.weight": totalWeight
    });
  }

  /* ===================================== */
  /* LISTENERS                             */
  /* ===================================== */

  activateListeners(html) {
    super.activateListeners(html);

    /**
     * Champs principaux de l’item.
     * On garde le recalcul local simple, sans aucune logique defaultContents.
     */
    html.find('input[name="system.quantity"], input[name="system.unitWeight"], input[name="system.emptyWeight"]').change(async () => {
      await this._recalculateWeightFromForm(html);
    });

    /**
     * Décochage du statut conteneur :
     * - si l’item n’est pas possédé, changement direct
     * - si l’item est possédé et contient encore des items, confirmation
     *   puis extraction préalable de tous les enfants pour éviter toute incohérence
     */
    html.find('input[name="system.isContainer"]').change(async ev => {
      const checked = ev.currentTarget.checked;

      if (checked) {
        await this.item.update({
          "system.isContainer": true,
          "system.quantity": 1
        });
        await this._recalculateWeightFromForm(html);
        return;
      }

      if (!this.isOwnedContainer) {
        await this.item.update({ "system.isContainer": false });
        return;
      }

      const children = this.actor.getContainerChildren(this.item.id);

      if (children.length === 0) {
        await this.item.update({ "system.isContainer": false });
        return;
      }

      const confirmed = await Dialog.confirm({
        title: "Retirer le statut de conteneur",
        content: "<p>Cet objet contient encore des éléments. Ils seront sortis du conteneur avant de retirer ce statut.</p>"
      });

      if (!confirmed) {
        ev.preventDefault();
        this.render(true);
        return;
      }

      for (const child of children) {
        await this.actor.extractItemFromContainer(child.id);
      }

      await this.item.update({ "system.isContainer": false });
    });

    if (!this.isEditable) return;

    /**
     * Double-clic sur une ligne runtime : ouvre la vraie fiche item.
     */
    html.find(".inventory-list .item").dblclick(ev => {
      const id = ev.currentTarget.dataset.itemId;
      if (!id || !this.actor) return;

      const item = this.actor.getInventoryItem(id);
      if (item) item.sheet.render(true);
    });

    /**
     * Toggle ouverture d’un sous-conteneur dans la vue runtime.
     */
    html.find(".container-toggle").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();

      if (!this.actor) return;

      const id = ev.currentTarget.dataset.containerId;
      if (!id) return;

      await this.actor.toggleContainerExpanded(id);
    });

    /**
     * Modification de quantité d’un enfant réel.
     */
    html.find(".item-qty").change(async ev => {
      if (!this.actor) return;

      const id = this._getItemIdFromEventTarget(ev.currentTarget);
      if (!id) return;

      const value = Math.max(0, Math.floor(Number(ev.currentTarget.value) || 0));
      await this.actor.updateInventoryItemQuantity(id, value);

      const item = this.actor.getInventoryItem(id);
      if (item?.system?.isContainer) {
        ev.currentTarget.value = 1;
      }
    });

    /**
     * Suppression d’un enfant réel.
     */
    html.find(".item-delete").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();

      if (!this.actor) return;

      const id = ev.currentTarget.dataset.itemId;
      if (!id) return;

      await this.actor.deleteInventoryItem(id);
    });

    /**
     * Sortie d’un enfant réel du conteneur.
     */
    html.find(".item-extract").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();

      if (!this.actor) return;

      const id = ev.currentTarget.dataset.itemId;
      if (!id) return;

      await this.actor.extractItemFromContainer(id);
    });

    /**
     * Drag start sur une ligne runtime.
     */
    html.find(".drag-handle").on("dragstart", ev => {
      const dt = this._getDragTransfer(ev);
      if (!dt) return;

      const itemId = ev.currentTarget.dataset.itemId;
      if (!itemId) return;

      dt.setData("text/plain", itemId);

      const li = ev.currentTarget.closest(".item");
      li?.classList.add("dragging");
    });

    html.find(".drag-handle").on("dragend", ev => {
      const li = ev.currentTarget.closest(".item");
      li?.classList.remove("dragging");

      html.find(".inventory-list .item.dragover").removeClass("dragover");
      html.find(".container-contents-runtime.dragover").removeClass("dragover");
    });

    /**
     * Drag over / leave sur les lignes runtime.
     */
    html.find(".inventory-list .item").on("dragover", ev => {
      ev.preventDefault();
      ev.currentTarget.classList.add("dragover");
    });

    html.find(".inventory-list .item").on("dragleave", ev => {
      ev.currentTarget.classList.remove("dragover");
    });

    html.find(".inventory-list .item").on("drop", async ev => {
      ev.currentTarget.classList.remove("dragover");
      await this._handleRuntimeContainerDrop(ev);
    });

    /**
     * Drop sur le fond de la vue de contenu :
     * ajoute directement dans le conteneur actuellement ouvert.
     */
    html.find(".container-contents-runtime").on("dragover", ev => {
      ev.preventDefault();
      ev.currentTarget.classList.add("dragover");
    });

    html.find(".container-contents-runtime").on("dragleave", ev => {
      ev.currentTarget.classList.remove("dragover");
    });

    html.find(".container-contents-runtime").on("drop", async ev => {
      ev.currentTarget.classList.remove("dragover");
      await this._handleRuntimeContainerDrop(ev);
    });
  }

  /* ===================================== */
  /* DROP                                  */
  /* ===================================== */

  async _onDrop(event) {
    /**
     * On redirige le drop global vers la logique runtime,
     * mais seulement pour un conteneur possédé.
     */
    if (this.isOwnedContainer) {
      await this._handleRuntimeContainerDrop(event);
      return;
    }

    return super._onDrop(event);
  }
}