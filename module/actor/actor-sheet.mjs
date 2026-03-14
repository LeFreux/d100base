export class D100ActorSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["d100base", "sheet", "actor"],
      width: 600,
      height: 700
    });
  }

  get template() {
    return "systems/d100base/templates/actor-sheet.hbs";
  }

  getData() {

    const context = super.getData();

    context.system = this.actor.system;

    const items = this.actor.items.contents;

    const containers = items.filter(i => i.system.isContainer);

    const inventory = items.filter(i => !i.system.container);

    for (const container of containers) {
      container.contents = items.filter(i => i.system.container === container.id);
    }

    context.inventory = inventory;
    context.containers = containers;

    return context;

  }

  activateListeners(html) {

    super.activateListeners(html);

    /* jets de caractéristique */

    html.on("click", "[data-roll]", async ev => {

      ev.preventDefault();

      const attribute = ev.currentTarget.dataset.roll;

      await this.actor.rollAttribute(attribute);

    });

    /* modifier quantité */

    html.find(".item-qty").change(async ev => {

      const li = ev.currentTarget.closest(".item");
      const itemId = li.dataset.itemId;

      const item = this.actor.items.get(itemId);

      const qty = Number(ev.currentTarget.value);

      await item.update({
        "system.quantity": qty
      });

    });

    /* supprimer objet */

    html.find(".item-delete").click(async ev => {

      const li = ev.currentTarget.closest(".item");
      const itemId = li.dataset.itemId;

      const item = this.actor.items.get(itemId);

      await item.delete();

    });

  }

  async _onDrop(event) {

    const data = TextEditor.getDragEventData(event);

    if (data.type !== "Item") return;

    const containerEl = event.target.closest("[data-container-id]");

    const containerId = containerEl ? containerEl.dataset.containerId : null;

    /* objet venant d'un compendium ou du monde */

    if (data.uuid) {

      const item = await fromUuid(data.uuid);

      const itemData = item.toObject();

      itemData.system.container = containerId;

      await this.actor.createEmbeddedDocuments("Item", [itemData]);

      return;

    }

    /* objet déjà sur l'acteur */

    if (data.actorId === this.actor.id) {

      const item = this.actor.items.get(data.data._id);

      await item.update({
        "system.container": containerId
      });

    }

  }

}