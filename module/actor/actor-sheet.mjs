import {
  LOCALIZED_WOUND_PARTS,
  LOCALIZED_WOUND_STATES
} from "../data-models.mjs";

export class D100ActorSheet extends ActorSheet {

  constructor(...args) {
    super(...args);

    this._sortState = {
      field: null,
      direction: null
    };
  }

  /* ===================================== */
  /* OPTIONS                               */
  /* ===================================== */

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["d100base", "sheet", "actor"],
      template: "systems/d100base/templates/actor-sheet.hbs",
      width: 1000,
      height: 700,
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-content",
          initial: "main"
        }
      ]
    });
  }

  /* ===================================== */
  /* DATA                                  */
  /* ===================================== */

  async getData() {
    const data = await super.getData();

    data.system = this.actor.system;

    data.config = {
      attributes: {
        corpsacorps: "D100BASE.Attributes.corpsacorps",
        capacitedetir: "D100BASE.Attributes.capacitedetir",
        force: "D100BASE.Attributes.force",
        agilite: "D100BASE.Attributes.agilite",
        intelligence: "D100BASE.Attributes.intelligence",
        perception: "D100BASE.Attributes.perception",
        stress: "D100BASE.Attributes.stress"
      },

      attributesShort: {
        corpsacorps: "CC",
        capacitedetir: "CT",
        force: "F",
        agilite: "A",
        intelligence: "I",
        perception: "P",
        stress: "S"
      }
    };

    let tree = this.actor.getInventoryTree();

    if (this._sortState.field && this._sortState.direction) {
      this._sortNodes(tree);
    }

    data.inventoryTree = tree;

    data.sortState = {
      field: this._sortState.field,
      direction: this._sortState.direction,
      icons: {
        name: this._getSortIcon("name"),
        type: this._getSortIcon("type"),
        quantity: this._getSortIcon("quantity"),
        weight: this._getSortIcon("weight")
      }
    };

    data.showToken = this.actor.getFlag("d100base", "showToken") ?? false;
    data.tokenImg = this.actor.prototypeToken?.texture?.src || this.actor.img;

    /* ------------------------------------- */
    /* BLESSURES LOCALISÉES                  */
    /* ------------------------------------- */

	const localizedWounds = this._getLocalizedWoundsSnapshot();

	data.localizedWounds = localizedWounds;
	data.localizedWoundStates = this._getLocalizedWoundStateOptions();
	data.localizedWoundParts = this._prepareLocalizedWoundParts(localizedWounds);
	data.localizedWoundLegend = this._prepareLocalizedWoundLegend();
	data.localizedWoundsSvg = await this._buildLocalizedWoundsSvg(localizedWounds);

    return data;
  }

  /* ===================================== */
  /* BLESSURES LOCALISÉES - DATA           */
  /* ===================================== */

  _getFallbackLocalizedWounds() {
    return {
      head: "indemne",
      torso: "indemne",
      rightArm: "indemne",
      leftArm: "indemne",
      rightLeg: "indemne",
      leftLeg: "indemne"
    };
  }

  _getLocalizedWoundsSnapshot() {
    const fallback = this._getFallbackLocalizedWounds();
    const source = this.actor.system?.state?.localizedWounds ?? {};

    return {
      head: source.head ?? fallback.head,
      torso: source.torso ?? fallback.torso,
      rightArm: source.rightArm ?? fallback.rightArm,
      leftArm: source.leftArm ?? fallback.leftArm,
      rightLeg: source.rightLeg ?? fallback.rightLeg,
      leftLeg: source.leftLeg ?? fallback.leftLeg
    };
  }

  _getPartLabelKey(partKey) {
    const map = {
      head: "D100BASE.WoundParts.Head",
      torso: "D100BASE.WoundParts.Torso",
      rightArm: "D100BASE.WoundParts.RightArm",
      leftArm: "D100BASE.WoundParts.LeftArm",
      rightLeg: "D100BASE.WoundParts.RightLeg",
      leftLeg: "D100BASE.WoundParts.LeftLeg"
    };

    return map[partKey] ?? partKey;
  }

  _getLocalizedWoundStateLabelKey(stateKey) {
    const map = {
      indemne: "D100BASE.WoundStates.Indemne",
      blesse: "D100BASE.WoundStates.Blesse",
      "gravement-blesse": "D100BASE.WoundStates.GravementBlesse",
      inoperant: "D100BASE.WoundStates.Inoperant",
      perdu: "D100BASE.WoundStates.Perdu",
      artificiel: "D100BASE.WoundStates.Artificiel"
    };

    return map[stateKey] ?? stateKey;
  }

  _getLocalizedWoundStateCssClass(stateKey) {
    const normalized = LOCALIZED_WOUND_STATES.includes(stateKey)
      ? stateKey
      : "indemne";

    return `state-${normalized}`;
  }

  _getLocalizedWoundStateOptions() {
    return LOCALIZED_WOUND_STATES.map(stateKey => ({
      value: stateKey,
      label: game.i18n.localize(this._getLocalizedWoundStateLabelKey(stateKey)),
      cssClass: this._getLocalizedWoundStateCssClass(stateKey)
    }));
  }

  _prepareLocalizedWoundParts(localizedWounds = {}) {
    return LOCALIZED_WOUND_PARTS.map(partKey => {
      const stateKey = localizedWounds[partKey] ?? "indemne";
      const label = game.i18n.localize(this._getPartLabelKey(partKey));
      const stateLabel = game.i18n.localize(this._getLocalizedWoundStateLabelKey(stateKey));

      return {
        key: partKey,
        label,
        state: stateKey,
        stateLabel,
        cssClass: this._getLocalizedWoundStateCssClass(stateKey),
        partClass: `part-${partKey}`,
        title: `${label} : ${stateLabel}`
      };
    });
  }

  _prepareLocalizedWoundLegend() {
    return this._getLocalizedWoundStateOptions().map(entry => ({
      ...entry
    }));
  }

  async _buildLocalizedWoundsSvg(localizedWounds = {}) {
    const response = await fetch("systems/d100base/assets/svg/body.svg");
    const rawSvg = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawSvg, "image/svg+xml");
    const svg = doc.documentElement;

    svg.classList.add("localized-wounds-svg");

    for (const partKey of LOCALIZED_WOUND_PARTS) {
      const node = svg.querySelector(`[data-part="${partKey}"], #${partKey}`);
      if (!node) continue;

      const stateKey = localizedWounds[partKey] ?? "indemne";
      const partLabel = game.i18n.localize(this._getPartLabelKey(partKey));
      const stateLabel = game.i18n.localize(this._getLocalizedWoundStateLabelKey(stateKey));

      node.setAttribute("data-part", partKey);
      node.setAttribute("data-state", stateKey);
      node.setAttribute("tabindex", "0");
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", `${partLabel} : ${stateLabel}`);
      node.setAttribute("title", `${partLabel} : ${stateLabel}`);
      node.classList.add("localized-wound-svg-part");
    }

    return new XMLSerializer().serializeToString(svg);
  }

  /* ===================================== */
  /* SORT                                  */
  /* ===================================== */

  _sortNodes(nodes) {
    const { field, direction } = this._sortState;
    const factor = direction === "asc" ? 1 : -1;

    nodes.sort((a, b) => {
      switch (field) {
        case "name":
          return (a.name || "").localeCompare(b.name || "") * factor;

        case "type":
          return (a.system?.category || "").localeCompare(b.system?.category || "") * factor;

        case "quantity":
          return ((Number(a.system?.quantity ?? 0)) - (Number(b.system?.quantity ?? 0))) * factor;

        case "weight":
          return ((Number(a.system?.weight ?? 0)) - (Number(b.system?.weight ?? 0))) * factor;

        default:
          return 0;
      }
    });

    for (const node of nodes) {
      if (node.contents?.length) this._sortNodes(node.contents);
    }
  }

  _toggleSort(field) {
    if (this._sortState.field !== field) {
      this._sortState.field = field;
      this._sortState.direction = "asc";
      return;
    }

    if (this._sortState.direction === "asc") {
      this._sortState.direction = "desc";
      return;
    }

    if (this._sortState.direction === "desc") {
      this._sortState.field = null;
      this._sortState.direction = null;
      return;
    }

    this._sortState.direction = "asc";
  }

  /* ===================================== */
  /* HELPERS UI                            */
  /* ===================================== */

  _getItemIdFromEventTarget(target) {
    return target?.closest?.(".item")?.dataset?.itemId ?? null;
  }

  _getDraggedItemIdFromEvent(event) {
    const dt = event.originalEvent?.dataTransfer || event.dataTransfer;
    if (!dt) return null;
    return dt.getData("text/plain") || null;
  }

  _getDragTransfer(event) {
    return event.originalEvent?.dataTransfer || event.dataTransfer || null;
  }

  _getTargetItemFromDropEvent(event) {
    const targetLi = event.currentTarget?.closest?.(".item") || event.currentTarget;
    const targetId = targetLi?.dataset?.itemId;
    if (!targetId) return null;
    return this.actor.getInventoryItem(targetId);
  }

  _getSortIcon(field) {
    if (this._sortState.field !== field || !this._sortState.direction) {
      return "▶";
    }

    return this._sortState.direction === "asc" ? "▲" : "▼";
  }

  /* ===================================== */
  /* DIALOG BLESSURES LOCALISÉES           */
  /* ===================================== */

  async _onLocalizedWoundPartClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!this.isEditable) return;

    const partKey = event.currentTarget?.dataset?.part || event.currentTarget?.id;
    if (!partKey) return;
    if (!LOCALIZED_WOUND_PARTS.includes(partKey)) return;

    await this._openLocalizedWoundDialog(partKey);
  }

  async _updateLocalizedWound(partKey, stateKey) {
    if (!LOCALIZED_WOUND_PARTS.includes(partKey)) return false;
    if (!LOCALIZED_WOUND_STATES.includes(stateKey)) return false;

    await this.actor.update({
      [`system.state.localizedWounds.${partKey}`]: stateKey
    });

    return true;
  }

  async _openLocalizedWoundDialog(partKey) {
    if (!LOCALIZED_WOUND_PARTS.includes(partKey)) return;

    const currentState = this._getLocalizedWoundsSnapshot()[partKey] ?? "indemne";
    const partLabel = game.i18n.localize(this._getPartLabelKey(partKey));
    const stateOptions = this._getLocalizedWoundStateOptions();

    const optionsHtml = stateOptions.map(option => `
      <option value="${option.value}" ${option.value === currentState ? "selected" : ""}>
        ${option.label}
      </option>
    `).join("");

    const content = `
      <form class="localized-wound-dialog">
        <div class="form-group">
          <label>${game.i18n.localize("D100BASE.Dialogs.LocalizedWoundState")}</label>
          <select name="localized-wound-state">
            ${optionsHtml}
          </select>
        </div>
      </form>
    `;

    return new Promise(resolve => {
      new Dialog({
        title: `${game.i18n.localize("D100BASE.Dialogs.LocalizedWoundTitle")} — ${partLabel}`,
        content,
        buttons: {
          save: {
            icon: '<i class="fas fa-check"></i>',
            label: game.i18n.localize("D100BASE.Common.Save"),
            callback: async html => {
              const stateKey = html.find('[name="localized-wound-state"]').val();
              const success = await this._updateLocalizedWound(partKey, stateKey);
              resolve(success);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: game.i18n.localize("D100BASE.Common.Cancel"),
            callback: () => resolve(false)
          }
        },
        default: "save",
        render: html => {
          html.find('[name="localized-wound-state"]').focus();
        },
        close: () => resolve(false)
      }).render(true);
    });
  }

  /* ===================================== */
  /* DRAG & DROP MÉTIER                    */
  /* ===================================== */

  /**
   * Détermine où rattacher l'item déplacé :
   * - drop sur un conteneur => dans ce conteneur
   * - drop sur un item simple => dans le même conteneur que lui
   */
  _resolveDropTargetContainerId(targetItem) {
    if (!targetItem) return null;
    if (targetItem.system?.isContainer) return targetItem.id;
    return this.actor.getEffectiveContainerId(targetItem);
  }

  async _handleInventoryDrop(event) {
    event.preventDefault();

    const draggedId = this._getDraggedItemIdFromEvent(event);
    const targetItem = this._getTargetItemFromDropEvent(event);

    if (!draggedId || !targetItem) return;

    const draggedItem = this.actor.getInventoryItem(draggedId);
    if (!draggedItem) return;
    if (draggedItem.id === targetItem.id) return;

    const targetContainerId = this._resolveDropTargetContainerId(targetItem);

    await this.actor.tryStackOrMoveItem(
      draggedItem.id,
      targetItem?.id ?? null,
      targetContainerId
    );
  }

  /* ===================================== */
  /* LISTENERS                             */
  /* ===================================== */

  activateListeners(html) {
    super.activateListeners(html);

    /* ROLL */
    html.find("[data-roll]").click(ev => {
      const key = ev.currentTarget.dataset.roll;
      this.actor.rollAttribute(key);
    });

    /* TOGGLE PORTRAIT / TOKEN */
    html.find(".toggle-portrait").click(async (ev) => {
      ev.preventDefault();

      const current = this.actor.getFlag("d100base", "showToken") ?? false;
      await this.actor.setFlag("d100base", "showToken", !current);
    });

    /* BLESSURES LOCALISÉES */
    html.on("click", ".localized-wound-svg-part", async ev => {
      if (!this.isEditable) return;
      await this._onLocalizedWoundPartClick(ev);
    });

    html.on("keydown", ".localized-wound-svg-part", async ev => {
      if (!this.isEditable) return;
      if (ev.key !== "Enter" && ev.key !== " ") return;

      ev.preventDefault();
      await this._onLocalizedWoundPartClick(ev);
    });

    if (!this.isEditable) return;

    /* OPEN ITEM */
    const inventoryItemSelector = ".inventory-list .item";

    html.find(inventoryItemSelector).dblclick(ev => {
      const id = ev.currentTarget.dataset.itemId;
      const item = this.actor.getInventoryItem(id);
      if (item) item.sheet.render(true);
    });

    /* TOGGLE CONTAINER */
    html.find(".container-toggle").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();

      const id = ev.currentTarget.dataset.containerId;
      if (!id) return;

      await this.actor.toggleContainerExpanded(id);
    });

    /* QUANTITY */
    html.find(".inventory-list .item-qty").change(async ev => {
      const li = ev.currentTarget.closest(".item");
      const id = li?.dataset?.itemId;
      if (!id) return;

      const value = Math.max(0, Number(ev.currentTarget.value));

      const success = await this.actor.updateInventoryItemQuantity(id, value);
      if (!success) return;

      const item = this.actor.getInventoryItem(id);
      if (item?.system?.isContainer) {
        ev.currentTarget.value = 1;
      }
    });

    /* DELETE */
    html.find(".item-delete").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();

      const id = ev.currentTarget.dataset.itemId;
      if (!id) return;

      await this.actor.deleteInventoryItem(id);
    });

    /* EXTRACT */
    html.find(".item-extract").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();

      const id = ev.currentTarget.dataset.itemId;
      if (!id) return;

      await this.actor.extractItemFromContainer(id);
    });

    /* SORT */
    html.find(".sortable").click(ev => {
      const field = ev.currentTarget.dataset.sort;
      if (!field) return;

      this._toggleSort(field);
      this.render();
    });

    /* DRAG START */
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
    });

    /* DRAG OVER */
    html.find(inventoryItemSelector).on("dragover", ev => {
      ev.preventDefault();
      ev.currentTarget.classList.add("dragover");
    });

    html.find(inventoryItemSelector).on("dragleave", ev => {
      ev.currentTarget.classList.remove("dragover");
    });

    html.find(inventoryItemSelector).on("drop", async ev => {
      ev.currentTarget.classList.remove("dragover");
      await this._handleInventoryDrop(ev);
    });
  }
}