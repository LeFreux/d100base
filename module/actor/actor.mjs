export class D100Actor extends Actor {

  prepareDerivedData() {
    super.prepareDerivedData();

    this._normalizeEmbeddedItems();
    this._prepareInventoryTotals();
  }

  /**
   * Harmonise les anciennes données (system.container)
   * avec la nouvelle structure (system.containerId),
   * sans casser les fiches déjà existantes.
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

      if (system.weight === undefined || system.weight === null) {
        system.weight = 0;
      }

      if (system.unitWeight === undefined || system.unitWeight === null) {
        system.unitWeight = 0;
      }

      if (system.isContainer && typeof system.expanded !== "boolean") {
        system.expanded = true;
      }
    }
  }

  /**
   * Poids total porté par l'acteur :
   * on additionne seulement les items racine
   * pour éviter de compter deux fois le contenu
   * des conteneurs.
   */
  _prepareInventoryTotals() {
    let total = 0;

    for (const item of this.items) {
      const parentId = item.system.containerId ?? item.system.container ?? null;

      if (!parentId) {
        total += Number(item.system.weight) || 0;
      }
    }

    this.system.totalWeight = Math.round(total * 100) / 100;
  }

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
    if (result === 1) outcome = "Critique";
    else if (result <= attributeValue) outcome = "Réussite";
    else if (result >= 96) outcome = "Fumble";

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${labels[attributeKey] ?? attributeKey} (${attributeValue}%) → ${outcome}`
    });
  }
}