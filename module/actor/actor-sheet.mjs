export class D100ActorSheet extends ActorSheet {

  constructor(...args) {
    super(...args);

    this._sortState = {
      field: null,
      direction: null
    };
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["d100base", "sheet", "actor"],
      template: "systems/d100base/templates/actor-sheet.hbs",
      width: 900,
      height: 700
    });
  }

  /** @override */
  getData() {
    const data = super.getData();

    data.system = this.actor.system;

    const items = this.actor.items.contents;

    let tree = this._buildInventoryTree(items);

    if (this._sortState.field && this._sortState.direction) {
      this._sortNodes(tree);
    }

    data.inventoryTree = tree;

    return data;
  }

  /* ===================================== */
  /* 🌳 INVENTORY TREE                     */
  /* ===================================== */

  _buildInventoryTree(items) {

    const map = new Map();

    for (let item of items) {

      const containerId = item.system.containerId ?? item.system.container ?? null;

      map.set(item.id, {
        id: item.id,
        item: item,
        name: item.name,
        img: item.img,
        system: item.system,
        contents: [],
        depth: 0,
        expanded: item.system.expanded ?? true,
        containerId: containerId
      });
    }

    const roots = [];

    for (let node of map.values()) {

      if (node.containerId && map.has(node.containerId)) {
        const parent = map.get(node.containerId);

        node.depth = parent.depth + 1;
        parent.contents.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /* ===================================== */
  /* 🔄 SORT                              */
  /* ===================================== */

  _sortNodes(nodes) {

    const { field, direction } = this._sortState;
    const factor = direction === "asc" ? 1 : -1;

    nodes.sort((a, b) => {

      switch (field) {

        case "name":
          return a.name.localeCompare(b.name) * factor;

        case "type":
          return (a.system.category || "").localeCompare(b.system.category || "") * factor;

        case "quantity":
          return ((a.system.quantity || 0) - (b.system.quantity || 0)) * factor;

        case "weight":
          return ((a.system.weight || 0) - (b.system.weight || 0)) * factor;

        default:
          return 0;
      }
    });

    for (let node of nodes) {
      if (node.contents?.length) {
        this._sortNodes(node.contents);
      }
    }
  }

  /* ===================================== */
  /* 🎧 LISTENERS                          */
  /* ===================================== */

  activateListeners(html) {
    super.activateListeners(html);

    if (!this.isEditable) return;

    /* ========================= */
    /* 🎲 ROLL                   */
    /* ========================= */

    html.find("[data-roll]").click(ev => {
      const key = ev.currentTarget.dataset.roll;
      this.actor.rollAttribute(key);
    });

    /* ========================= */
    /* 📂 OPEN ITEM              */
    /* ========================= */

    html.find(".item").dblclick(ev => {
      const id = ev.currentTarget.dataset.itemId;
      const item = this.actor.items.get(id);
      if (item) item.sheet.render(true);
    });

    /* ========================= */
    /* 🔽 TOGGLE CONTAINER       */
    /* ========================= */

    html.find(".container-toggle").click(ev => {
      const id = ev.currentTarget.dataset.containerId;
      const item = this.actor.items.get(id);

      if (!item) return;

      item.update({
        "system.expanded": !item.system.expanded
      });
    });

    /* ========================= */
    /* 🔢 QUANTITY               */
    /* ========================= */

    html.find(".item-qty").change(ev => {
      const li = ev.currentTarget.closest(".item");
      const id = li?.dataset?.itemId;

      const item = this.actor.items.get(id);
      if (!item) return;

      const value = Math.max(0, Number(ev.currentTarget.value));

      item.update({
        "system.quantity": value
      });
    });

    /* ========================= */
    /* ❌ DELETE                 */
    /* ========================= */

    html.find(".item-delete").click(ev => {
      const id = ev.currentTarget.dataset.itemId;
      this.actor.deleteEmbeddedDocuments("Item", [id]);
    });

    /* ========================= */
    /* ⬆ EXTRACT                */
    /* ========================= */

    html.find(".item-extract").click(ev => {
      const id = ev.currentTarget.dataset.itemId;
      const item = this.actor.items.get(id);

      if (!item) return;

      item.update({
        "system.containerId": null,
        "system.container": null
      });
    });

    /* ========================= */
    /* 🔄 SORT                  */
    /* ========================= */

    html.find(".sortable").click(ev => {

      const field = ev.currentTarget.dataset.sort;

      if (this._sortState.field !== field) {
        this._sortState.field = field;
        this._sortState.direction = "asc";
      } else {
        if (this._sortState.direction === "asc") {
          this._sortState.direction = "desc";
        } else if (this._sortState.direction === "desc") {
          this._sortState.field = null;
          this._sortState.direction = null;
        } else {
          this._sortState.direction = "asc";
        }
      }

      this.render();
    });

    html.find(".sortable").each((i, el) => {

      const field = el.dataset.sort;
      const icon = el.querySelector(".sort-icon");

      if (!icon) return;

      if (this._sortState.field !== field) {
        icon.textContent = "▶";
      } else {
        if (this._sortState.direction === "asc") icon.textContent = "▲";
        else if (this._sortState.direction === "desc") icon.textContent = "▼";
        else icon.textContent = "▶";
      }
    });

    /* ========================= */
    /* 🖱 DRAG START             */
    /* ========================= */

    html.find(".item").attr("draggable", true);

    html.find(".item").on("dragstart", ev => {
      const id = ev.currentTarget.dataset.itemId;

      const dt = ev.originalEvent?.dataTransfer || ev.dataTransfer;
      if (!dt) return;

      dt.setData("text/plain", id);
      ev.currentTarget.classList.add("dragging");
    });

    html.find(".item").on("dragend", ev => {
      ev.currentTarget.classList.remove("dragging");
    });

    /* ========================= */
    /* 🧲 DRAG OVER              */
    /* ========================= */

    html.find(".item").on("dragover", ev => {
      ev.preventDefault();
      ev.currentTarget.classList.add("dragover");
    });

    html.find(".item").on("dragleave", ev => {
      ev.currentTarget.classList.remove("dragover");
    });

    /* ========================= */
    /* 📦 DROP + MERGE           */
    /* ========================= */

    html.find(".item").on("drop", async ev => {
      ev.preventDefault();

      const targetEl = ev.currentTarget;
      targetEl.classList.remove("dragover");

      const dt = ev.originalEvent?.dataTransfer || ev.dataTransfer;
      if (!dt) return;

      const draggedId = dt.getData("text/plain");
      const targetId = targetEl.dataset.itemId;

      if (!draggedId || draggedId === targetId) return;

      const dragged = this.actor.items.get(draggedId);
      const target = this.actor.items.get(targetId);

      if (!dragged || !target) return;

      /* ========================= */
      /* 🔗 MERGE STACKS           */
      /* ========================= */

      const canMerge =
        !dragged.system.isContainer &&
        !target.system.isContainer &&
        dragged.name === target.name &&
        dragged.system.category === target.system.category &&
        dragged.system.unitWeight === target.system.unitWeight;

      if (canMerge) {

        const newQty =
          (target.system.quantity || 0) +
          (dragged.system.quantity || 0);

        await target.update({
          "system.quantity": newQty
        });

        await dragged.delete();

        return;
      }

      /* ========================= */
      /* ❌ ANTI LOOP              */
      /* ========================= */

      if (this._isDescendant(target, draggedId)) return;

      /* ========================= */
      /* 📦 MOVE INTO CONTAINER    */
      /* ========================= */

      if (target.system.isContainer) {
        await dragged.update({
          "system.containerId": target.id,
          "system.container": target.id
        });
      }
    });

    /* ========================= */
    /* 🌍 DROP ROOT              */
    /* ========================= */

    html.find(".inventory-list").on("drop", async ev => {
      if (ev.target.closest(".item")) return;

      const dt = ev.originalEvent?.dataTransfer || ev.dataTransfer;
      if (!dt) return;

      const draggedId = dt.getData("text/plain");

      const item = this.actor.items.get(draggedId);
      if (!item) return;

      await item.update({
        "system.containerId": null,
        "system.container": null
      });
    });
  }

  /* ===================================== */
  /* 🔁 ANTI LOOP                          */
  /* ===================================== */

  _isDescendant(target, draggedId) {

    const parentId = target.system.containerId ?? target.system.container;

    if (!parentId) return false;
    if (parentId === draggedId) return true;

    const parent = this.actor.items.get(parentId);
    if (!parent) return false;

    return this._isDescendant(parent, draggedId);
  }

}