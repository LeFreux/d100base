export class D100Item extends Item {

  prepareDerivedData() {
    super.prepareDerivedData();

    const system = this.system;

    const quantity = Math.max(0, Number(system.quantity ?? 1));
    const unitWeight = Math.max(0, Number(system.unitWeight ?? 0));
    const emptyWeight = Math.max(0, Number(system.emptyWeight ?? 0));

    const legacyContainer = system.container ?? null;
    const currentContainerId = system.containerId ?? null;
    const normalizedContainerId = currentContainerId ?? legacyContainer ?? null;

    // Compat ascendante / descendante
    system.containerId = normalizedContainerId;
    system.container = normalizedContainerId;

    if (typeof system.expanded !== "boolean") {
      system.expanded = true;
    }

    if (!system.isContainer) {
      system.unitWeight = unitWeight;
      system.weight = this._roundWeight(unitWeight * quantity);
      return;
    }

    let contentWeight = 0;

    // Cas 1 : item embarqué dans un acteur
    if (this.actor) {
      const children = this.actor.items.filter(i => {
        if (i.id === this.id) return false;
        const childParent = i.system.containerId ?? i.system.container ?? null;
        return childParent === this.id;
      });

      contentWeight = children.reduce((sum, child) => {
        return sum + (Number(child.system.weight) || 0);
      }, 0);
    }

    // Cas 2 : item "monde" / contenu par défaut de la fiche item
    else {
      const defaults = Array.isArray(system.defaultContents) ? system.defaultContents : [];

      contentWeight = defaults.reduce((sum, entry) => {
        return sum + (Number(entry.weight) || 0);
      }, 0);
    }

    const calculatedUnitWeight = this._roundWeight(emptyWeight + contentWeight);
    const calculatedTotalWeight = this._roundWeight(calculatedUnitWeight * quantity);

    system.unitWeight = calculatedUnitWeight;
    system.weight = calculatedTotalWeight;
  }

  _roundWeight(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  async _onCreate(data, options, userId) {
    await super._onCreate(data, options, userId);

    if (!this.actor) return;
    if (!this.system.isContainer) return;

    const contents = this.system.defaultContents ?? [];
    if (!contents.length) return;

    const itemsToCreate = contents.map(content => {
      const quantity = Math.max(0, Number(content.quantity ?? 1));
      const unitWeight = Math.max(0, Number(content.unitWeight ?? 0));
      const weight = this._roundWeight(
        Number(content.weight ?? (unitWeight * quantity))
      );

      return {
        name: content.name || "Objet",
        type: "item",
        img: content.img || "icons/svg/item-bag.svg",
        system: {
          category: content.category ?? "Divers",
          quantity,
          unitWeight,
          weight,
          description: content.description ?? "",
          isContainer: false,
          emptyWeight: 0,
          capacityWeight: 0,
          expanded: true,

          // Nouveau champ
          containerId: this.id,

          // Ancien champ conservé pour compatibilité
          container: this.id,

          defaultContents: []
        }
      };
    });

    await this.actor.createEmbeddedDocuments("Item", itemsToCreate);
  }
}