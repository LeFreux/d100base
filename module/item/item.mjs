export class D100Item extends Item {

  /* ===================================== */
  /* DERIVED DATA                          */
  /* ===================================== */

  prepareDerivedData() {
    super.prepareDerivedData();

    const system = this.system;

    if (system.quantity === undefined || system.quantity === null) {
      system.quantity = 1;
    }

    let quantity = Math.max(0, Number(system.quantity ?? 1));

    if (system.isContainer) {
      quantity = 1;
      system.quantity = 1;
    }

    const unitWeight = Math.max(0, Number(system.unitWeight ?? 0));
    const emptyWeight = Math.max(0, Number(system.emptyWeight ?? 0));

    const legacyContainer = system.container ?? null;
    const currentContainerId = system.containerId ?? null;
    const normalizedContainerId = currentContainerId ?? legacyContainer ?? null;

    // Compatibilité transitoire pendant migration.
    // La source de vérité runtime reste system.containerId.
    system.containerId = normalizedContainerId;
    system.container = normalizedContainerId;

    if (typeof system.expanded !== "boolean") {
      system.expanded = true;
    }

    /* ============================= */
    /* ITEM SIMPLE                   */
    /* ============================= */

    if (!system.isContainer) {
      system.unitWeight = this._roundWeight(unitWeight);
      system.weight = this._roundWeight(unitWeight * quantity);
      system.overweight = false;
      return;
    }

    /* ============================= */
    /* CONTENEUR                     */
    /* ============================= */

    system.unitWeight = this._roundWeight(emptyWeight);
    system.weight = this._roundWeight(emptyWeight);
    system.quantity = 1;

    if (typeof system.overweight !== "boolean") {
      system.overweight = false;
    }
  }

  /* ===================================== */
  /* UTILS                                 */
  /* ===================================== */

  _roundWeight(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  /**
   * Retourne l'identifiant de conteneur effectif,
   * utile tant que le champ legacy `container` existe encore.
   */
  getEffectiveContainerId() {
    return this.system.containerId ?? this.system.container ?? null;
  }

  /**
   * Indique si l'item est actuellement contenu dans un autre item.
   */
  isContained() {
    return !!this.getEffectiveContainerId();
  }

  /**
   * Indique si l'item est possédé par un acteur.
   */
  isOwnedByActor() {
    return this.parent instanceof Actor;
  }

}